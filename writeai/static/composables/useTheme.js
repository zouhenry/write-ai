import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

export function useTheme() {
  const savedTheme = localStorage.getItem('theme');
  const isDark = ref(savedTheme !== 'light');

  function applyTheme() {
    if (isDark.value) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  function toggleTheme() {
    isDark.value = !isDark.value;
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
    applyTheme();
  }

  applyTheme();

  return { isDark, toggleTheme };
}
