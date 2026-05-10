import {
  ref,
  watch,
  nextTick,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { loadConversations, saveConversations } from '../utils/storage.js';

export default {
  name: 'ChatMessages',
  props: {
    conversations: { type: Array, required: true },
    activeConversationId: { type: String, required: true },
  },
  emits: ['update-conversations'],
  setup(props, { emit }) {
    const chatHistory = ref([]);
    const inputText = ref('');
    const loading = ref(false);
    const chatAreaRef = ref(null);
    let abortController = null;

    function loadHistory(id) {
      const conv = props.conversations.find((c) => c.id === id);
      chatHistory.value = conv ? [...conv.messages] : [];
    }

    watch(
      () => props.activeConversationId,
      (id) => loadHistory(id),
      { immediate: true },
    );

    function scrollToBottom() {
      nextTick(() => {
        if (chatAreaRef.value)
          chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight;
      });
    }

    function persistMessages(id, messages) {
      const convs = props.conversations.map((c) =>
        c.id === id ? { ...c, messages: [...messages] } : c,
      );
      saveConversations(convs);
      emit('update-conversations', convs);
    }

    async function generateTitle(firstUserMsg, firstAiMsg) {
      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Summarize this conversation topic in 6 words or fewer.',
            history: [
              { role: 'user', content: firstUserMsg },
              { role: 'assistant', content: firstAiMsg },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.response ? data.response.trim().replace(/['"]/g, '') : null;
      } catch {
        return null;
      }
    }

    async function sendChatMessage() {
      const message = inputText.value.trim();
      if (!message) return;
      inputText.value = '';

      chatHistory.value = [
        ...chatHistory.value,
        { role: 'user', content: message },
      ];
      persistMessages(props.activeConversationId, chatHistory.value);
      loading.value = true;
      scrollToBottom();

      // Placeholder assistant message that we'll fill token-by-token
      chatHistory.value = [
        ...chatHistory.value,
        { role: 'assistant', content: '' },
      ];
      const aiIndex = chatHistory.value.length - 1;

      abortController = new AbortController();
      try {
        const res = await fetch('/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: chatHistory.value.slice(-11, -1), // exclude the empty placeholder
          }),
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop(); // keep incomplete last line
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break;
            try {
              const chunk = JSON.parse(payload);
              if (chunk.error) throw new Error(chunk.error);
              if (chunk.token) {
                const updated = [...chatHistory.value];
                updated[aiIndex] = {
                  role: 'assistant',
                  content: updated[aiIndex].content + chunk.token,
                };
                chatHistory.value = updated;
                scrollToBottom();
                await new Promise((r) => setTimeout(r, 0));
              }
            } catch (e) {
              if (e.name !== 'SyntaxError') throw e;
            }
          }
        }

        const aiResponse = chatHistory.value[aiIndex].content;
        persistMessages(props.activeConversationId, chatHistory.value);

        const userCount = chatHistory.value.filter(
          (m) => m.role === 'user',
        ).length;
        if (userCount === 1) {
          const placeholderConvs = props.conversations.map((c) =>
            c.id === props.activeConversationId &&
            c.title === 'New conversation'
              ? { ...c, title: message.slice(0, 40) }
              : c,
          );
          saveConversations(placeholderConvs);
          emit('update-conversations', placeholderConvs);

          const titleConvId = props.activeConversationId;
          generateTitle(message, aiResponse)
            .then((title) => {
              if (!title) return;
              const latest = loadConversations();
              const i = latest.findIndex((c) => c.id === titleConvId);
              if (i !== -1) {
                latest[i].title = title;
                saveConversations(latest);
                emit('update-conversations', latest);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // Persist whatever was streamed before stop
          persistMessages(props.activeConversationId, chatHistory.value);
          return;
        }
        console.error(err);
        const updated = [...chatHistory.value];
        updated[aiIndex] = {
          role: 'assistant',
          content:
            'Sorry, I encountered an error processing your request. Please try again.',
        };
        chatHistory.value = updated;
        persistMessages(props.activeConversationId, chatHistory.value);
      } finally {
        abortController = null;
        loading.value = false;
        scrollToBottom();
      }
    }

    function stopChat() {
      if (abortController) abortController.abort();
    }

    function onKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    }

    function sanitize(content) {
      return window.DOMPurify.sanitize(window.marked.parse(content), {
        ADD_TAGS: [
          'annotation',
          'semantics',
          'math',
          'mrow',
          'mi',
          'mn',
          'mo',
          'msup',
          'msub',
          'mfrac',
          'mtext',
          'mspace',
          'mover',
          'munder',
          'munderover',
          'mtable',
          'mtr',
          'mtd',
          'mlabeledtr',
        ],
        ADD_ATTR: ['encoding', 'columnalign', 'style', 'aria-hidden'],
      });
    }

    return {
      chatHistory,
      inputText,
      loading,
      chatAreaRef,
      sendChatMessage,
      stopChat,
      onKeydown,
      sanitize,
    };
  },
  template: `
    <div class="chat-container">
      <div id="chatHistory" class="chat-history" ref="chatAreaRef">
        <template v-if="chatHistory.length === 0">
          <div class="message ai-message">
            <div class="message-content">Hello! I'm your AI assistant. How can I help you today?</div>
          </div>
        </template>
        <template v-else>
          <template v-for="(msg, i) in chatHistory" :key="i">
            <div
              v-if="msg.content || msg.role === 'user'"
              class="message"
              :class="msg.role === 'user' ? 'user-message' : 'ai-message'"
            >
              <div class="message-content" v-if="msg.role === 'assistant'" v-html="sanitize(msg.content)"></div>
              <div class="message-content" v-else>{{ msg.content }}</div>
            </div>
          </template>
        </template>
        <div v-if="loading && chatHistory.length && chatHistory[chatHistory.length - 1].content === ''" class="message ai-message loading-msg">
          <div class="message-content">AI is thinking...</div>
        </div>
      </div>
      <div class="chat-input-area">
        <textarea
          id="chatInput"
          v-model="inputText"
          placeholder="Ask me anything..."
          rows="3"
          @keydown="onKeydown"
        ></textarea>
        <button v-if="loading" id="stopChatBtn" @click="stopChat">Stop</button>
        <button v-else id="sendChatBtn" @click="sendChatMessage">Send</button>
      </div>
    </div>
  `,
};
