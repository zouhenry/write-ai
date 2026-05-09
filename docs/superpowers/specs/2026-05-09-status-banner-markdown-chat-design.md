# Design: API Status Banner + Chat Markdown Rendering

**Date:** 2026-05-09  
**Status:** Approved

## Overview

Two independent UI improvements:

1. Show a red offline banner below the nav when the REST API (`/health`) is unreachable.
2. Render markdown in AI Chat responses using marked.js, sanitized with DOMPurify.

No backend changes required for either feature.

---

## Feature 1: API Status Banner

### Behavior

- On page load, `checkApiStatus()` calls `GET /health` once.
- If the response is non-200 or the fetch throws (network error, timeout), `#statusBanner` becomes visible.
- If online, `#statusBanner` remains hidden — it takes up no DOM space.
- The check re-runs whenever the page regains focus:
  - `document.addEventListener('visibilitychange', ...)` — fires when the user switches back to this browser tab (`document.visibilityState === 'visible'`)
  - `window.addEventListener('focus', ...)` — fires when the OS window regains focus
- When the server comes back, the banner disappears automatically on the next focus check.

### HTML (`index.html`)

Insert one new element between `<nav class="top-nav">` and `<div class="container">`:

```html
<div id="statusBanner" class="status-banner" style="display:none">
  <span class="status-dot"></span>
  AI models offline — some features may be unavailable.
</div>
```

### CSS (`style.css`)

```css
.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(229, 62, 62, 0.15);
  border-bottom: 1px solid rgba(229, 62, 62, 0.3);
  color: #fc8181;
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fc8181;
  flex-shrink: 0;
  animation: pulse-red 1.5s ease-in-out infinite;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### JavaScript (`script.js`)

```js
async function checkApiStatus() {
  try {
    const res = await fetch('/health', { method: 'GET' });
    setStatusBanner(!res.ok);
  } catch {
    setStatusBanner(true);
  }
}

function setStatusBanner(offline) {
  document.getElementById('statusBanner').style.display = offline ? 'flex' : 'none';
}

// Run on page load
checkApiStatus();

// Re-run when tab/window regains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkApiStatus();
});
window.addEventListener('focus', checkApiStatus);
```

---

## Feature 2: Markdown Rendering in AI Chat

### Behavior

- AI (`assistant`) chat messages are rendered as HTML via `marked.parse()`, then sanitized with DOMPurify before being set as `innerHTML`.
- DOMPurify prevents XSS from any malicious content in LLM responses.
- User messages continue to use `textContent` (no markdown rendering — plain text, no XSS risk).
- Chat history loaded from `localStorage` also renders correctly because it goes through the same `renderChatMessage()` path.
- `marked` is configured with `{ breaks: true }` so single newlines become `<br>` tags, which is natural for chat.

### HTML (`index.html`)

Add DOMPurify and marked.js CDN scripts before `script.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="static/script.js"></script>
```

### JavaScript (`script.js`)

Configure marked once at the top of the file:

```js
marked.use({ breaks: true });
```

In `renderChatMessage()`, change the assistant branch to use sanitized `innerHTML`:

```js
if (role === 'assistant') {
  contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(content));
} else {
  contentDiv.textContent = content;
}
```

### CSS (`style.css`)

Scope markdown element styles to AI messages to avoid bleeding into other parts of the UI:

```css
.ai-message .message-content code {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.ai-message .message-content pre {
  background: rgba(255, 255, 255, 0.07);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.ai-message .message-content ul,
.ai-message .message-content ol {
  margin: 6px 0 6px 20px;
  padding: 0;
}

.ai-message .message-content li {
  margin-bottom: 3px;
}

.ai-message .message-content h1,
.ai-message .message-content h2,
.ai-message .message-content h3 {
  margin: 10px 0 4px;
  font-size: 1em;
  font-weight: 700;
}

.ai-message .message-content p {
  margin: 4px 0;
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `writeai/static/index.html` | Add `#statusBanner` div; add DOMPurify + marked.js CDN script tags |
| `writeai/static/script.js` | Add `checkApiStatus()`, `setStatusBanner()`, focus listeners; configure marked; update `renderChatMessage()` |
| `writeai/static/style.css` | Add `.status-banner`, `.status-dot`, `@keyframes pulse-red`; add `.ai-message .message-content` markdown styles |

## Out of Scope

- No backend changes
- No polling interval (focus-based only)
- No markdown rendering for user messages or non-chat parts of the UI
