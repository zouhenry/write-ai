import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { copyToClipboard } from '../utils/clipboard.js';

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
  name: 'ParaphraseTab',
  setup() {
    const inputText    = ref('');
    const rephraseData = ref(null);
    const loading      = ref(false);

    function results() {
      if (!rephraseData.value) return [];
      return [
        { label: 'Corrected', badge: 'Grammar Fixed', value: rephraseData.value.corrected,  isDiff: true  },
        { label: 'Formal',    badge: 'Formal',        value: rephraseData.value.formal,     isDiff: false },
        { label: 'Casual',    badge: 'Casual',        value: rephraseData.value.casual,     isDiff: false },
        { label: 'Concise',   badge: 'Concise',       value: rephraseData.value.concise,    isDiff: false },
      ];
    }

    async function rephraseText() {
      const text = inputText.value.trim();
      if (!text) { alert('Please enter some text to restructure.'); return; }
      loading.value = true;
      try {
        const res = await fetch('/restructure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        rephraseData.value = await res.json();
      } catch (err) {
        console.error(err);
        showToast('Error restructuring text. Please try again.', true);
      } finally {
        loading.value = false;
      }
    }

    function clearText() {
      inputText.value    = '';
      rephraseData.value = null;
    }

    function copyResult(value, e) {
      copyToClipboard(value, e.currentTarget);
    }

    return { inputText, rephraseData, loading, results, rephraseText, clearText, copyResult };
  },
  template: `
    <div class="tab-content active">
      <div class="tab-description">
        <p>Rephrase your text in different styles: corrected grammar, formal tone, casual conversation, or concise version.</p>
      </div>
      <div class="structure-container">
        <div class="structure-input-section">
          <div class="editor-header">
            <h2>Your Text</h2>
            <div class="editor-actions">
              <button id="rephraseBtn" @click="rephraseText" :disabled="loading">Rephrase</button>
              <button id="clearStructureBtn" @click="clearText" class="secondary">Clear</button>
            </div>
          </div>
          <textarea
            id="structureInputText"
            v-model="inputText"
            placeholder="Enter your text here to get alternative versions with improved sentence structure..."
            rows="12"
          ></textarea>
        </div>

        <div class="structure-results-section">
          <div class="structure-results-header"><h2>Results</h2></div>
          <div class="structure-results">
            <template v-if="loading">
              <div class="empty-state"><p>Restructuring...</p></div>
            </template>
            <template v-else-if="results().length > 0">
              <div v-for="result in results()" :key="result.label" class="structure-result-item">
                <div class="structure-result-header">
                  <div class="result-label">
                    <span class="result-badge">{{ result.badge }}</span>
                  </div>
                  <button class="copy-icon" title="Copy to clipboard" @click="copyResult(result.value, $event)">📋</button>
                </div>
                <template v-if="result.isDiff">
                  <div class="diff-view">
                    <div class="original-text">
                      <strong>Original:</strong>
                      <span v-html="rephraseData.corrected_highlighted_original || rephraseData.original"></span>
                    </div>
                    <div class="corrected-text-suggestion">
                      <strong>Suggested:</strong>
                      <span v-html="rephraseData.corrected_highlighted_corrected || result.value"></span>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="result-text">{{ result.value }}</div>
                </template>
              </div>
            </template>
            <template v-else>
              <div class="empty-state">
                <p>No results yet</p>
                <small>Enter text and click "Rephrase" to see alternatives</small>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="loading" :style="{ display: loading ? 'flex' : 'none' }">
        <div class="spinner"></div>
        <p>Restructuring...</p>
      </div>
    </div>
  `,
};
