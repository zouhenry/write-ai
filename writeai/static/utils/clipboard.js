export function copyToClipboard(text, iconEl, onError) {
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
      if (onError) onError(err);
    });
}
