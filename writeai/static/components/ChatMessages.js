import {
  ref,
  watch,
  nextTick,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { loadConversations, saveConversations } from '../utils/storage.js';
import { copyToClipboard } from '../utils/clipboard.js';

export default {
  name: 'ChatMessages',
  props: {
    conversations:         { type: Array,   required: true },
    activeConversationId:  { type: String,  required: true },
    endpoint:              { type: String,  default: '/chat/stream' },
    streaming:             { type: Boolean, default: true },
    rawInput:              { type: String,  default: '' },
    useCase:               { type: String,  default: 'general' },
  },
  emits: ['update-conversations', 'update:rawInput'],
  setup(props, { emit }) {
    const chatHistory = ref([]);
    const inputText = ref('');
    const loading = ref(false);
    const chatAreaRef = ref(null);
    const conversationStarted = ref(false);
    let abortController = null;

    function loadHistory(id) {
      const conv = props.conversations.find((c) => c.id === id);
      chatHistory.value = conv ? [...conv.messages] : [];
      // Restore conversationStarted from persisted messages (exclude isRawEcho display flag)
      conversationStarted.value = chatHistory.value.some((m) => m.role === 'user');
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
      // Only strip isRawEcho (display-only); keep isGenerated so generated blocks render on reload
      const clean = messages.map(({ isRawEcho, ...m }) => m);
      const convs = props.conversations.map((c) =>
        c.id === id ? { ...c, messages: [...clean] } : c,
      );
      saveConversations(convs);
      emit('update-conversations', convs);
    }

    // ── Streaming path (Chat tab) ─────────────────────────────────────────────

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

      chatHistory.value = [...chatHistory.value, { role: 'user', content: message }];
      persistMessages(props.activeConversationId, chatHistory.value);
      loading.value = true;
      scrollToBottom();

      chatHistory.value = [...chatHistory.value, { role: 'assistant', content: '' }];
      const aiIndex = chatHistory.value.length - 1;

      abortController = new AbortController();
      try {
        const res = await fetch(props.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: chatHistory.value.slice(-11, -1),
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
          buf = lines.pop();
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

        const userCount = chatHistory.value.filter((m) => m.role === 'user').length;
        if (userCount === 1) {
          const placeholderConvs = props.conversations.map((c) =>
            c.id === props.activeConversationId && c.title === 'New conversation'
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
          persistMessages(props.activeConversationId, chatHistory.value);
          return;
        }
        console.error(err);
        const updated = [...chatHistory.value];
        updated[aiIndex] = {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
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

    // ── Non-streaming path (Prompt Gen tab) ───────────────────────────────────

    function showToast(message, isError = false) {
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.className = 'toast' + (isError ? ' toast-error' : '');
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
      }, 3000);
    }

    function buildPromptGenHistory() {
      return chatHistory.value
        .filter((m) => !m.isRawEcho)
        .map(({ role, content }) => ({ role, content }));
    }

    async function sendPromptGenMessage() {
      const text = inputText.value.trim();
      if (!text || loading.value) return;
      inputText.value = '';

      let currentRawInput = props.rawInput;

      if (!conversationStarted.value) {
        currentRawInput = text;
        emit('update:rawInput', text);
        conversationStarted.value = true;
        chatHistory.value = [...chatHistory.value, { role: 'user', content: text, isRawEcho: true }];
        loading.value = true;
        try {
          const resp = await fetch(props.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raw_input: currentRawInput,
              use_case: props.useCase,
              history: [],
              phase: 'interrogation',
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${resp.status}`);
          }
          const data = await resp.json();
          chatHistory.value = [
            ...chatHistory.value,
            { role: 'assistant', content: data.message, isGenerated: data.phase === 'generation' },
          ];
          persistMessages(props.activeConversationId, chatHistory.value);
          // Set title to first 40 chars of raw input
          const titled = props.conversations.map((c) =>
            c.id === props.activeConversationId && c.title === 'New conversation'
              ? { ...c, title: text.slice(0, 40) }
              : c,
          );
          saveConversations(titled);
          emit('update-conversations', titled);
        } catch (e) {
          showToast(e.message, true);
          conversationStarted.value = false;
          chatHistory.value = [];
          emit('update:rawInput', '');
        }
      } else {
        chatHistory.value = [...chatHistory.value, { role: 'user', content: text }];
        loading.value = true;
        try {
          const resp = await fetch(props.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raw_input: currentRawInput,
              use_case: props.useCase,
              history: buildPromptGenHistory(),
              phase: 'interrogation',
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${resp.status}`);
          }
          const data = await resp.json();
          chatHistory.value = [
            ...chatHistory.value,
            { role: 'assistant', content: data.message, isGenerated: data.phase === 'generation' },
          ];
          persistMessages(props.activeConversationId, chatHistory.value);
        } catch (e) {
          showToast(e.message, true);
        }
      }

      loading.value = false;
      scrollToBottom();
    }

    function onCopy(event, text) {
      copyToClipboard(text, event.currentTarget, () => showToast('Copy failed', true));
    }

    // ── Shared ────────────────────────────────────────────────────────────────

    function onKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        props.streaming ? sendChatMessage() : sendPromptGenMessage();
      }
    }

    function sanitize(content) {
      return window.DOMPurify.sanitize(window.marked.parse(content), {
        ADD_TAGS: ['annotation','semantics','math','mrow','mi','mn','mo','msup','msub','mfrac','mtext','mspace','mover','munder','munderover','mtable','mtr','mtd','mlabeledtr'],
        ADD_ATTR: ['encoding', 'columnalign', 'style', 'aria-hidden'],
      });
    }

    const collapsedMessages = ref({});
    function toggleCollapse(i) {
      collapsedMessages.value = { ...collapsedMessages.value, [i]: !collapsedMessages.value[i] };
    }

    return {
      chatHistory,
      inputText,
      loading,
      chatAreaRef,
      collapsedMessages,
      conversationStarted,
      toggleCollapse,
      sendChatMessage,
      sendPromptGenMessage,
      stopChat,
      onKeydown,
      sanitize,
      onCopy,
    };
  },
  template: `
    <div class="chat-container">
      <!-- Default slot: used by PromptGenTab to inject use-case dropdown -->
      <slot></slot>

      <div id="chatHistory" class="chat-history" ref="chatAreaRef">
        <template v-if="chatHistory.length === 0">
          <div class="message ai-message">
            <div class="message-content">
              <template v-if="streaming">Hello! I'm your AI assistant. How can I help you today?</template>
              <template v-else>Select a use case and describe your prompt idea to get started.</template>
            </div>
          </div>
        </template>
        <template v-else>
          <template v-for="(msg, i) in chatHistory" :key="i">
            <div
              v-if="msg.content || msg.role === 'user'"
              class="message"
              :class="msg.role === 'user' ? 'user-message' : 'ai-message'"
            >
              <!-- Generated prompt block (non-streaming / prompt gen only) -->
              <div v-if="msg.isGenerated" class="message-content prompt-gen-output">
                <div class="prompt-gen-output-header">
                  <span class="prompt-gen-output-label">✦ Generated Prompt</span>
                  <button class="copy-btn" @click="onCopy($event, msg.content)" title="Copy prompt">⧉</button>
                </div>
                <pre class="prompt-gen-output-text">{{ msg.content }}</pre>
              </div>
              <!-- Standard assistant message (streaming, markdown) -->
              <div class="message-content" v-else-if="msg.role === 'assistant'" v-html="sanitize(msg.content)"></div>
              <!-- User message -->
              <div class="message-content user-prompt" v-else>
                <button
                  v-if="msg.content.split('\\n').length > 3"
                  class="user-prompt-toggle"
                  @click="toggleCollapse(i)"
                  :aria-expanded="!!collapsedMessages[i]"
                  :title="collapsedMessages[i] ? 'Collapse' : 'Expand'"
                ><span class="user-prompt-chevron" :class="{ expanded: collapsedMessages[i] }">&#8964;</span></button>
                <div class="user-prompt-body" :class="{ expanded: collapsedMessages[i] }">
                  <pre class="user-prompt-pre">{{ msg.content }}</pre>
                </div>
              </div>
            </div>
          </template>
        </template>
        <div v-if="loading && streaming && chatHistory.length && chatHistory[chatHistory.length - 1].content === ''" class="message ai-message loading-msg">
          <div class="message-content">AI is thinking...</div>
        </div>
        <div v-if="loading && !streaming" class="message ai-message loading-msg">
          <div class="message-content">Thinking…</div>
        </div>
      </div>

      <div class="chat-input-area" v-if="streaming || !chatHistory.some(m => m.isGenerated)">
        <textarea
          id="chatInput"
          v-model="inputText"
          :placeholder="!streaming && conversationStarted ? 'Your answer…' : (streaming ? 'Ask me anything...' : 'Describe your prompt idea…')"
          rows="3"
          :disabled="loading"
          @keydown="onKeydown"
        ></textarea>
        <template v-if="streaming">
          <button v-if="loading" id="stopChatBtn" @click="stopChat">Stop</button>
          <button v-else id="sendChatBtn" @click="sendChatMessage">Send</button>
        </template>
        <template v-else>
          <button @click="sendPromptGenMessage" :disabled="!inputText.trim() || loading">
            {{ loading ? 'Sending…' : 'Send' }}
          </button>
        </template>
      </div>
    </div>
  `,
};
