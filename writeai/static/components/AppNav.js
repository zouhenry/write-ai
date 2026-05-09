import { inject } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

export default {
  name: 'AppNav',
  setup() {
    const activeTab   = inject('activeTab');
    const setTab      = inject('setTab');
    const isOffline   = inject('isOffline');
    const isDark      = inject('isDark');
    const toggleTheme = inject('toggleTheme');
    const isInstalled = inject('isInstalled');
    const canInstall  = inject('canInstall');
    const install     = inject('install');
    return { activeTab, setTab, isOffline, isDark, toggleTheme, isInstalled, canInstall, install };
  },
  template: `
    <div>
      <div
        class="theme-toggle"
        :title="isDark ? 'Dark Mode (Click to switch to Light Mode)' : 'Light Mode (Click to switch to Dark Mode)'"
        @click="toggleTheme"
      >{{ isDark ? '🌙' : '☀️' }}</div>

      <button
        v-if="canInstall && !isInstalled"
        id="installBtn"
        class="install-btn"
        title="Install WriteAI as a desktop app"
        @click="install"
      >⬇ Install App</button>

      <nav class="top-nav">
        <div class="nav-content">
          <div class="nav-branding"><h1>WriteAI</h1></div>
          <div class="tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'paraphrase' }"
              @click="setTab('paraphrase')"
            >Paraphrase</button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'chat' }"
              @click="setTab('chat')"
            >AI Chat</button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'grammar' }"
              @click="setTab('grammar')"
            >Grammar Check</button>
          </div>
          <div>&nbsp;</div>
        </div>
      </nav>

      <div class="status-banner" :style="{ display: isOffline ? 'flex' : 'none' }">
        <span class="status-dot"></span>
        AI models offline — some features may be unavailable.
      </div>
    </div>
  `,
};
