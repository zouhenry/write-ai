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
    const rawInput = ref('');
    const useCase = ref('general');
    const messages = ref([]);       // [{ role: 'assistant'|'user', content: string, isGenerated?: bool }]
    const replyInput = ref('');
    const isLoading = ref(false);
    const conversationStarted = ref(false);

    onMounted(() => {
      bannerVisible.value = !localStorage.getItem(BANNER_KEY);
    });

    function dismissBanner() {
      bannerVisible.value = false;
      localStorage.setItem(BANNER_KEY, '1');
    }

    function resetConversation() {
      messages.value = [];
      replyInput.value = '';
      conversationStarted.value = false;
      isLoading.value = false;
    }

    // Build the history array for the API from messages already in the thread.
    // The rawInput is sent separately as raw_input, so we exclude the first user
    // message (which is the raw prompt echo) from history.
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
          raw_input: rawInput.value.trim(),
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

    async function onGenerate() {
      if (!rawInput.value.trim() || isLoading.value) return;
      resetConversation();
      conversationStarted.value = true;
      // Echo the raw input as the first user message (marked so it's excluded from history)
      messages.value.push({ role: 'user', content: rawInput.value.trim(), isRawEcho: true });
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
      } finally {
        isLoading.value = false;
        await nextTick();
        scrollToBottom();
      }
    }

    async function onSendReply() {
      const text = replyInput.value.trim();
      if (!text || isLoading.value) return;
      replyInput.value = '';
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
      } finally {
        isLoading.value = false;
        await nextTick();
        scrollToBottom();
      }
    }

    function scrollToBottom() {
      const el = document.querySelector('.prompt-gen-thread');
      if (el) el.scrollTop = el.scrollHeight;
    }

    function onCopy(event, text) {
      copyToClipboard(text, event.currentTarget, (err) => showToast('Copy failed', true));
    }

    const lastMessageIsGenerated = computed(() =>
      messages.value.length > 0 && messages.value[messages.value.length - 1].isGenerated
    );

    return {
      bannerVisible,
      dismissBanner,
      rawInput,
      useCase,
      messages,
      replyInput,
      isLoading,
      conversationStarted,
      lastMessageIsGenerated,
      USE_CASES,
      onGenerate,
      onSendReply,
      onCopy,
    };
  },
  template: `
    <div class="tab-content active">
      <div v-if="bannerVisible" class="tab-description">
        <p>Enter a rough prompt idea, select a use case, and let AI refine it into a structured prompt.</p>
        <button class="banner-dismiss" @click="dismissBanner" aria-label="Dismiss">&#x2715;</button>
      </div>

      <div class="prompt-gen-input-area">
        <textarea
          v-model="rawInput"
          class="prompt-gen-textarea"
          placeholder="Describe what you want your prompt to do..."
          rows="4"
          :disabled="isLoading"
        ></textarea>
        <div class="prompt-gen-controls">
          <select v-model="useCase" class="prompt-gen-select" :disabled="isLoading">
            <option v-for="uc in USE_CASES" :key="uc.value" :value="uc.value">{{ uc.label }}</option>
          </select>
          <button
            class="btn btn-primary"
            @click="onGenerate"
            :disabled="!rawInput.trim() || isLoading"
          >{{ isLoading && !conversationStarted ? 'Starting…' : 'Generate' }}</button>
        </div>
      </div>

      <div v-if="conversationStarted" class="prompt-gen-thread">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['prompt-gen-msg', msg.role === 'user' ? 'prompt-gen-msg--user' : 'prompt-gen-msg--ai']"
        >
          <div v-if="msg.isGenerated" class="prompt-gen-output">
            <div class="prompt-gen-output-header">
              <span class="prompt-gen-output-label">✦ Generated Prompt</span>
              <button class="copy-btn" @click="onCopy($event, msg.content)" title="Copy prompt">⧉</button>
            </div>
            <pre class="prompt-gen-output-text">{{ msg.content }}</pre>
          </div>
          <div v-else class="prompt-gen-bubble">{{ msg.content }}</div>
        </div>

        <div v-if="isLoading" class="prompt-gen-msg prompt-gen-msg--ai">
          <div class="prompt-gen-bubble prompt-gen-bubble--thinking">…</div>
        </div>
      </div>

      <div v-if="conversationStarted && !lastMessageIsGenerated" class="prompt-gen-reply-area">
        <input
          v-model="replyInput"
          class="prompt-gen-reply-input"
          placeholder="Your answer…"
          :disabled="isLoading"
          @keydown.enter.prevent="onSendReply"
        />
        <button
          class="btn btn-primary"
          @click="onSendReply"
          :disabled="!replyInput.trim() || isLoading"
        >{{ isLoading ? 'Sending…' : 'Send' }}</button>
      </div>
    </div>
  `,
};
