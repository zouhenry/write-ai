import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

export function useApiStatus() {
  const isOffline = ref(false);

  async function checkApiStatus() {
    try {
      const res = await fetch('/health', { method: 'GET' });
      isOffline.value = !res.ok;
    } catch {
      isOffline.value = true;
    }
  }

  return { isOffline, checkApiStatus };
}
