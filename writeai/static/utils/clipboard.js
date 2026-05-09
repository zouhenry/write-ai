export function copyToClipboard(text, iconEl) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const original = iconEl.innerHTML;
      iconEl.innerHTML = '✓';
      iconEl.classList.add('copied');
      setTimeout(() => {
        iconEl.innerHTML = original;
        iconEl.classList.remove('copied');
      }, 1500);
    })
    .catch((err) => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
}
