import {
  ref,
  computed,
  nextTick,
  onMounted,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { copyToClipboard } from '../utils/clipboard.js';

const BANNER_KEY = 'banner_dismissed_prompt_gen';

const USE_CASES = [
  { value: 'general',          label: 'General' },
  { value: 'coding',           label: 'Coding' },
  { value: 'remix_architect',  label: 'Remix Architect' },
  { value: 'creative_writing', label: 'Creative Writing' },
  { value: 'data_analysis',    label: 'Data Analysis' },
  { value: 'summarization',    label: 'Summarization' },
];

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

export default {
  name: 'PromptGenTab',
  setup() {
    const bannerVisible = ref(false);
    const rawInput = ref('');   // set once from the first message; reused for all subsequent API calls
    const useCase = ref('general');
    const messages = ref([]);
    const inputText = ref('');
    const isLoading = ref(false);
    const conversationStarted = ref(false);
    const threadRef = ref(null);

    onMounted(() => {
      bannerVisible.value = !localStorage.getItem(BANNER_KEY);
    });

    function dismissBanner() {
      bannerVisible.value = false;
      localStorage.setItem(BANNER_KEY, '1');
    }

    function buildHistory() {
      return messages.value
        .filter((m) => !m.isRawEcho)
        .map((m) => ({ role: m.role, content: m.content }));
    }

    async function sendToApi(history) {
      const resp = await fetch('/prompt-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_input: rawInput.value,
          use_case: useCase.value,
          history,
          phase: 'interrogation',
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${resp.status}`);
      }
      return resp.json();
    }

    async function onSend() {
      const text = inputText.value.trim();
      if (!text || isLoading.value) return;
      inputText.value = '';

      if (!conversationStarted.value) {
        // First message — becomes the raw prompt idea
        rawInput.value = text;
        conversationStarted.value = true;
        messages.value.push({ role: 'user', content: text, isRawEcho: true });
        isLoading.value = true;
        try {
          const data = await sendToApi([]);
          messages.value.push({
            role: 'assistant',
            content: data.message,
            isGenerated: data.phase === 'generation',
          });
        } catch (e) {
          showToast(e.message, true);
          conversationStarted.value = false;
          messages.value = [];
          rawInput.value = '';
        }
      } else {
        // Subsequent messages — answers to clarifying questions
        messages.value.push({ role: 'user', content: text });
        isLoading.value = true;
        try {
          const data = await sendToApi(buildHistory());
          messages.value.push({
            role: 'assistant',
            content: data.message,
            isGenerated: data.phase === 'generation',
          });
        } catch (e) {
          showToast(e.message, true);
        }
      }

      isLoading.value = false;
      await nextTick();
      if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight;
    }

    function onCopy(event, text) {
      copyToClipboard(text, event.currentTarget, (err) => showToast('Copy failed', true));
    }

    const lastMessageIsGenerated = computed(() =>
      messages.value.length > 0 && messages.value[messages.value.length - 1].isGenerated
    );

    const inputPlaceholder = computed(() =>
      conversationStarted.value ? 'Your answer…' : 'Describe your prompt idea…'
    );

    return {
      bannerVisible,
      dismissBanner,
      useCase,
      messages,
      inputText,
      isLoading,
      conversationStarted,
      lastMessageIsGenerated,
      inputPlaceholder,
      USE_CASES,
      threadRef,
      onSend,
      onCopy,
    };
  },
  template: `
    <div class="tab-content active">
      <div v-if="bannerVisible" class="tab-description">
        <p>Describe your prompt idea, select a use case, and let AI refine it into a structured prompt.</p>
        <button class="banner-dismiss" @click="dismissBanner" aria-label="Dismiss">&#x2715;</button>
      </div>

      <div class="prompt-gen-controls">
        <label class="prompt-gen-select-label">Use case</label>
        <select v-model="useCase" class="prompt-gen-select" :disabled="conversationStarted || isLoading">
          <option v-for="uc in USE_CASES" :key="uc.value" :value="uc.value">{{ uc.label }}</option>
        </select>
      </div>

      <div class="chat-container">
        <div class="chat-history" ref="threadRef">
          <template v-if="messages.length === 0">
            <div class="message ai-message">
              <div class="message-content">Select a use case and describe your prompt idea to get started.</div>
            </div>
          </template>
          <template v-else>
            <div
              v-for="(msg, i) in messages"
              :key="i"
              class="message"
              :class="msg.role === 'user' ? 'user-message' : 'ai-message'"
            >
              <div v-if="msg.isGenerated" class="message-content prompt-gen-output">
                <div class="prompt-gen-output-header">
                  <span class="prompt-gen-output-label">✦ Generated Prompt</span>
                  <button class="copy-btn" @click="onCopy($event, msg.content)" title="Copy prompt">⧉</button>
                </div>
                <pre class="prompt-gen-output-text">{{ msg.content }}</pre>
              </div>
              <div v-else class="message-content">{{ msg.content }}</div>
            </div>
          </template>

          <div v-if="isLoading" class="message ai-message loading-msg">
            <div class="message-content">Thinking…</div>
          </div>
        </div>

        <div v-if="!lastMessageIsGenerated" class="chat-input-area">
          <textarea
            v-model="inputText"
            :placeholder="inputPlaceholder"
            rows="3"
            :disabled="isLoading"
            @keydown.enter.exact.prevent="onSend"
          ></textarea>
          <button @click="onSend" :disabled="!inputText.trim() || isLoading">
            {{ isLoading ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  `,
};
