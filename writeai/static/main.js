import { createApp, ref, provide, onMounted, onUnmounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { useApiStatus } from './composables/useApiStatus.js';
import { useTheme     } from './composables/useTheme.js';
import { usePwa       } from './composables/usePwa.js';
import AppNav        from './components/AppNav.js';
import GrammarTab    from './components/GrammarTab.js';
import ParaphraseTab from './components/ParaphraseTab.js';
import ChatTab       from './components/ChatTab.js';

const VALID_TABS = ['grammar', 'paraphrase', 'chat'];

function resolveInitialTab() {
  const hash   = window.location.hash.slice(1);
  const stored = localStorage.getItem('activeTab');
  return VALID_TABS.includes(hash)   ? hash
       : VALID_TABS.includes(stored) ? stored
       : 'paraphrase';
}

const App = {
  components: { AppNav, GrammarTab, ParaphraseTab, ChatTab },
  setup() {
    const { isOffline, checkApiStatus }       = useApiStatus();
    const { isDark, toggleTheme }             = useTheme();
    const { isInstalled, canInstall, install } = usePwa();
    const activeTab = ref(resolveInitialTab());

    function setTab(name) {
      activeTab.value = name;
      localStorage.setItem('activeTab', name);
      history.replaceState(null, '', '#' + name);
    }

    provide('activeTab',   activeTab);
    provide('setTab',      setTab);
    provide('isOffline',   isOffline);
    provide('isDark',      isDark);
    provide('toggleTheme', toggleTheme);
    provide('isInstalled', isInstalled);
    provide('canInstall',  canInstall);
    provide('install',     install);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') checkApiStatus();
    }
    function onHashChange() {
      const tab = window.location.hash.slice(1);
      if (VALID_TABS.includes(tab)) setTab(tab);
    }

    onMounted(() => {
      checkApiStatus();
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('focus', checkApiStatus);
      window.addEventListener('hashchange', onHashChange);
    });

    onUnmounted(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkApiStatus);
      window.removeEventListener('hashchange', onHashChange);
    });

    return { activeTab };
  },
  template: `
    <AppNav />
    <div class="container">
      <GrammarTab    v-show="activeTab === 'grammar'"    />
      <ParaphraseTab v-show="activeTab === 'paraphrase'" />
      <ChatTab       v-show="activeTab === 'chat'"       />
    </div>
  `,
};

createApp(App).mount('#app');
