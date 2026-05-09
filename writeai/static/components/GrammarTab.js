import { ref, reactive, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { copyToClipboard } from '../utils/clipboard.js';

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

function findBestOccurrence(haystack, needle, approxIndex) {
  if (!needle || !haystack) return null;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(haystack)) !== null) {
    matches.push([m.index, m.index + needle.length]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (matches.length === 0) return null;
  let best = matches[0];
  let bestDist = Math.abs(best[0] - approxIndex);
  for (let i = 1; i < matches.length; i++) {
    const dist = Math.abs(matches[i][0] - approxIndex);
    if (dist < bestDist) { best = matches[i]; bestDist = dist; }
  }
  return best;
}

export default {
  name: 'GrammarTab',
  setup() {
    const inputText          = ref('');
    const corrections        = reactive({ suggestions: [], correctedText: '' });
    const appliedSuggestions = ref(new Set());
    const loading            = ref(false);
    const lastCaretPosition  = ref(0);
    const isApplyingSuggestion = ref(false);
    const textareaRef        = ref(null);

    const unappliedSuggestions = computed(() =>
      corrections.suggestions
        .map((s, i) => ({ ...s, globalIndex: i }))
        .filter((s) => !appliedSuggestions.value.has(s.globalIndex))
    );

    async function correctText() {
      const text = inputText.value.trim();
      if (!text) { alert('Please enter some text to check grammar.'); return; }
      loading.value = true;
      try {
        const res = await fetch('/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        const data = await res.json();
        corrections.suggestions   = data.suggestions || [];
        corrections.correctedText = data.corrected_text || '';
        appliedSuggestions.value  = new Set();
      } catch (err) {
        console.error(err);
        corrections.suggestions = [];
        showToast('Error checking grammar. Please try again.', true);
      } finally {
        loading.value = false;
      }
    }

    async function applySingleSuggestion(globalIndex) {
      const sug = corrections.suggestions[globalIndex];
      if (!sug) return;
      isApplyingSuggestion.value = true;
      try {
        const res = await fetch('/apply-suggestion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_text: inputText.value,
            suggestion_index: globalIndex,
            suggestions: corrections.suggestions,
          }),
        });
        if (!res.ok) throw new Error('Failed to apply suggestion');
        const result = await res.json();
        inputText.value = result.corrected_text;
        appliedSuggestions.value = new Set([...appliedSuggestions.value, globalIndex]);
        showToast('Applied correction for ' + sug.sentence);
      } catch (err) {
        console.error(err);
        showToast('Error applying suggestion. Please try again.', true);
      } finally {
        setTimeout(() => { isApplyingSuggestion.value = false; }, 100);
      }
    }

    function clearText() {
      inputText.value           = '';
      corrections.suggestions   = [];
      corrections.correctedText = '';
      appliedSuggestions.value  = new Set();
    }

    function onKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        correctText();
      }
    }

    function updateCaret() {
      if (textareaRef.value) lastCaretPosition.value = textareaRef.value.selectionStart;
    }

    function onSuggestionHover(sug) {
      if (!textareaRef.value) return;
      const text  = inputText.value;
      const start = sug.start_index ?? 0;
      const span  = findBestOccurrence(text, sug.original, start);
      if (span) {
        textareaRef.value.focus();
        textareaRef.value.setSelectionRange(span[0], span[1]);
      } else if (sug.start_index != null && sug.end_index != null) {
        const s = Math.max(0, Math.min(text.length, sug.start_index));
        const e = Math.max(0, Math.min(text.length, sug.end_index));
        if (e > s) { textareaRef.value.focus(); textareaRef.value.setSelectionRange(s, e); }
      }
    }

    function onSuggestionLeave() {
      if (!textareaRef.value) return;
      textareaRef.value.setSelectionRange(lastCaretPosition.value, lastCaretPosition.value);
    }

    function copyInput(e) {
      copyToClipboard(inputText.value, e.currentTarget);
    }

    function sanitize(html) {
      return window.DOMPurify.sanitize(html);
    }

    return {
      inputText, corrections, loading, textareaRef,
      unappliedSuggestions, correctText, applySingleSuggestion, clearText,
      onKeydown, updateCaret, onSuggestionHover, onSuggestionLeave, copyInput, escapeHtml, sanitize,
    };
  },
  template: `
    <div class="tab-content active">
      <div class="tab-description">
        <p>Check your text for grammar, spelling, and punctuation errors. Get instant suggestions to improve your writing.</p>
      </div>
      <div class="main-content">
        <div class="text-editor-section">
          <div class="editor-header">
            <h2>Your Text</h2>
            <div class="editor-actions">
              <button id="correctBtn" @click="correctText" :disabled="loading">Check Grammar</button>
              <button id="clearBtn" @click="clearText" class="secondary">Clear</button>
            </div>
          </div>
          <div class="textarea-wrapper">
            <textarea
              ref="textareaRef"
              id="inputText"
              v-model="inputText"
              placeholder="Start writing your text here... Example: i dont know weather to bring a umbrella today"
              rows="20"
              @keydown="onKeydown"
              @keyup="updateCaret"
              @click="updateCaret"
            ></textarea>
            <button
              class="copy-icon textarea-copy-btn"
              :class="{ visible: inputText.length > 0 }"
              title="Copy to clipboard"
              @click="copyInput"
            >📋</button>
          </div>
        </div>

        <div class="suggestions-section">
          <div class="suggestions-header">
            <h2>Suggestions</h2>
            <span class="count-badge">{{ unappliedSuggestions.length }}</span>
          </div>
          <div class="suggestions-list">
            <template v-if="loading">
              <div class="empty-state"><p>Checking grammar...</p></div>
            </template>
            <template v-else-if="unappliedSuggestions.length > 0">
              <div
                v-for="sug in unappliedSuggestions"
                :key="sug.globalIndex"
                class="suggestion-item"
                @mouseenter="onSuggestionHover(sug)"
                @mouseleave="onSuggestionLeave"
                @focusin="onSuggestionHover(sug)"
                @focusout="onSuggestionLeave"
              >
                <div class="suggestion-header">
                  <span class="suggestion-sentence">{{ sug.sentence }}</span>
                  <button class="apply-btn" @click="applySingleSuggestion(sug.globalIndex)">Apply</button>
                </div>
                <div class="original-text">
                  <strong>Original:</strong>
                  <span v-html="sug.original_highlighted ? sanitize(sug.original_highlighted) : escapeHtml(sug.original)"></span>
                </div>
                <div class="corrected-text-suggestion">
                  <strong>Suggested:</strong>
                  <span v-html="sug.corrected_highlighted ? sanitize(sug.corrected_highlighted) : escapeHtml(sug.corrected)"></span>
                </div>
              </div>
            </template>
            <template v-else-if="corrections.suggestions.length > 0">
              <div class="empty-state"><p>All suggestions applied!</p><small>Your text looks great</small></div>
            </template>
            <template v-else>
              <div class="empty-state">
                <p>No grammar issues found yet</p>
                <small>Start writing and click "Check Grammar" to see suggestions</small>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="loading" :style="{ display: loading ? 'flex' : 'none' }">
        <div class="spinner"></div>
        <p>Checking grammar...</p>
      </div>
    </div>
  `,
};
