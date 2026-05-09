import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

export function usePwa() {
  const isInstalled = ref(
    window.matchMedia('(display-mode: standalone)').matches,
  );
  const canInstall = ref(false);
  let _deferredPrompt = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('Service worker registration failed:', err);
        });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    canInstall.value = true;
  });

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true;
    canInstall.value = false;
    _deferredPrompt = null;
  });

  async function install() {
    if (_deferredPrompt) {
      _deferredPrompt.prompt();
      const { outcome } = await _deferredPrompt.userChoice;
      _deferredPrompt = null;
      if (outcome === 'accepted') {
        isInstalled.value = true;
        canInstall.value = false;
      }
    } else if (isInstalled.value) {
      alert('WriteAI is already installed.');
    } else {
      alert(
        'To install: open this page in Chrome or Edge, then click the install icon in the address bar.',
      );
    }
  }

  return { isInstalled, canInstall, install };
}
