import { ref, watch, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import {
  loadConversations, saveConversations, setActiveConversationId,
} from '../utils/storage.js';

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}

export default {
  name: 'ChatMessages',
  props: {
    conversations:        { type: Array,  required: true },
    activeConversationId: { type: String, required: true },
  },
  emits: ['update-conversations', 'update-active-id'],
  setup(props, { emit }) {
    const chatHistory = ref([]);
    const inputText   = ref('');
    const loading     = ref(false);
    const chatAreaRef = ref(null);

    function loadHistory(id) {
      const conv = props.conversations.find((c) => c.id === id);
      chatHistory.value = conv ? [...conv.messages] : [];
    }

    watch(() => props.activeConversationId, (id) => loadHistory(id), { immediate: true });

    function scrollToBottom() {
      nextTick(() => {
        if (chatAreaRef.value) chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight;
      });
    }

    function persistMessages(id, messages) {
      const convs = loadConversations();
      const idx   = convs.findIndex((c) => c.id === id);
      if (idx !== -1) {
        convs[idx].messages = [...messages];
        saveConversations(convs);
        emit('update-conversations', convs);
      }
    }

    async function generateTitle(firstUserMsg, firstAiMsg) {
      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Summarize this conversation topic in 6 words or fewer.',
            history: [
              { role: 'user',      content: firstUserMsg },
              { role: 'assistant', content: firstAiMsg   },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.response ? data.response.trim().replace(/['"]/g, '') : null;
      } catch { return null; }
    }

    async function sendChatMessage() {
      const message = inputText.value.trim();
      if (!message) return;
      inputText.value = '';

      chatHistory.value = [...chatHistory.value, { role: 'user', content: message }];
      persistMessages(props.activeConversationId, chatHistory.value);
      loading.value = true;
      scrollToBottom();

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: chatHistory.value.slice(-10) }),
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        const data = await res.json();

        chatHistory.value = [...chatHistory.value, { role: 'assistant', content: data.response }];
        persistMessages(props.activeConversationId, chatHistory.value);

        const userCount = chatHistory.value.filter((m) => m.role === 'user').length;
        if (userCount === 1) {
          const convs = loadConversations();
          const idx   = convs.findIndex((c) => c.id === props.activeConversationId);
          if (idx !== -1 && convs[idx].title === 'New conversation') {
            convs[idx].title = message.slice(0, 40);
            saveConversations(convs);
            emit('update-conversations', convs);
          }
          const titleConvId = props.activeConversationId;
          generateTitle(message, data.response).then((title) => {
            if (!title) return;
            const c2  = loadConversations();
            const i   = c2.findIndex((c) => c.id === titleConvId);
            if (i !== -1) { c2[i].title = title; saveConversations(c2); emit('update-conversations', c2); }
          }).catch(() => {});
        }
      } catch (err) {
        console.error(err);
        chatHistory.value = [...chatHistory.value, {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        }];
        persistMessages(props.activeConversationId, chatHistory.value);
      } finally {
        loading.value = false;
        scrollToBottom();
      }
    }

    function onKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    }

    function sanitize(content) {
      return window.DOMPurify.sanitize(window.marked.parse(content));
    }

    return { chatHistory, inputText, loading, chatAreaRef, sendChatMessage, onKeydown, sanitize };
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
          <div
            v-for="(msg, i) in chatHistory"
            :key="i"
            class="message"
            :class="msg.role === 'user' ? 'user-message' : 'ai-message'"
          >
            <div class="message-content" v-if="msg.role === 'assistant'" v-html="sanitize(msg.content)"></div>
            <div class="message-content" v-else>{{ msg.content }}</div>
          </div>
        </template>
        <div v-if="loading" class="message ai-message loading-msg">
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
        <button id="sendChatBtn" @click="sendChatMessage">Send</button>
      </div>
    </div>
  `,
};
