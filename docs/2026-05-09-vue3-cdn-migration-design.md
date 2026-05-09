# Vue 3 CDN Migration Design

**Date:** 2026-05-09
**Status:** Approved

## Overview

Migrate the existing vanilla JS frontend (`script.js`, 1431 lines) to Vue 3 using ES modules loaded via CDN. No build step, no npm package. The goal is a maintainable component-based codebase while keeping the same UI appearance and all existing CSS unchanged.

## Constraints

- No build tooling, no npm
- Vue 3 loaded from CDN (`esm.browser` build via `<script type="module">`)
- `style.css` is not modified — Vue components emit the same class names
- PDF report functionality is excluded
- All existing API endpoints (`/correct`, `/apply-suggestion`, `/restructure`, `/chat`, `/health`) remain unchanged

## File Structure

```
writeai/static/
  main.js                    ← createApp, global state, mounts to #app
  composables/
    useApiStatus.js          ← offline detection, status banner state
    useTheme.js              ← dark/light toggle, localStorage persistence
    usePwa.js                ← SW registration, install prompt
  components/
    AppNav.js                ← top nav bar + tab buttons
    GrammarTab.js            ← grammar check tab
    ParaphraseTab.js         ← paraphrase/rephrase tab
    ChatTab.js               ← chat layout shell
    ChatSidebar.js           ← conversation list sidebar
    ChatMessages.js          ← message history + input area
  utils/
    clipboard.js             ← copyToClipboard
    storage.js               ← loadConversations, saveConversations, enforceStorageCap
```

`jspdf.umd.min.js`, `script.js` are removed. All other static files are unchanged.

## index.html Changes

- Remove all `<body>` content except a single `<div id="app"></div>`
- Remove `<script src="static/jspdf.umd.min.js">`
- Remove `<script src="static/script.js">`
- Remove `<script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js">` and `marked` CDN (these move into `main.js` as CDN imports or loaded in `<head>` as non-module scripts since they don't export ES modules)
- Add `<script type="module" src="static/main.js">`
- Add Vue 3 CDN: `<script type="module">` import from `https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js`

> Note: DOMPurify and marked don't ship ES module builds on CDN. They are loaded as classic scripts in `<head>` and accessed via `window.DOMPurify` / `window.marked` inside the chat component.

## Component Design

### `main.js`
- Imports Vue's `createApp`, `ref`, `provide`
- Creates composable instances: `useApiStatus()`, `useTheme()`, `usePwa()`
- Holds `activeTab` ref (default: restored from URL hash → localStorage → `'paraphrase'`)
- Registers all components globally
- Provides `activeTab`, `setTab`, `isOffline` to the tree via `provide`
- Mounts to `#app`
- Template: `<AppNav>` + conditional tab rendering via `v-show` (keeps DOM alive for chat state)

### `composables/useApiStatus.js`
- Returns `isOffline` ref
- `checkApiStatus()` fetches `/health`; sets `isOffline`
- Called on mount, `visibilitychange`, and `focus`

### `composables/useTheme.js`
- Returns `isDark` ref, `toggleTheme()`
- Reads/writes `localStorage.theme`; applies `dark-mode` class to `document.body`

### `composables/usePwa.js`
- Handles SW registration (`/sw.js`)
- Manages `_deferredInstallPrompt`
- Returns `canInstall` ref, `install()`, `isInstalled` ref
- Listens to `beforeinstallprompt`, `appinstalled`

### `components/AppNav.js`
- Props: none (reads `activeTab` via `inject`)
- Emits: none (calls `setTab` via injected function)
- Renders: nav bar with branding + three tab buttons; theme toggle button; install button (hidden if `isInstalled`)
- The status banner (`isOffline`) is also rendered here

### `components/GrammarTab.js`
- Local state: `inputText`, `corrections` (suggestions array + correctedText), `appliedSuggestions` (Set), `loading`, `lastCaretPosition`, `isApplyingSuggestion`
- Methods: `correctText()`, `applySingleSuggestion(index)`, `clearText()`
- Removes the writing quality score and download report UI (no PDF)
- Hover-highlight behavior (selecting text in textarea on suggestion hover) implemented with `@mouseenter`/`@mouseleave` on suggestion items using template refs for the textarea
- Copy button on textarea uses `copyToClipboard` from `utils/clipboard.js`
- Keyboard shortcut (Ctrl/Cmd+Enter) handled via `@keydown` on the textarea

### `components/ParaphraseTab.js`
- Local state: `inputText`, `rephraseData`, `loading`
- Methods: `rephraseText()`, `clearText()`
- Renders: input textarea + four result cards (Corrected diff view, Formal, Casual, Concise)
- Corrected card shows original/suggested diff using `original_highlighted_original` / `corrected_highlighted_corrected` from the API response
- Copy buttons use `copyToClipboard` from `utils/clipboard.js`
- The `showDifferencesToggle` reference in the old `clearRephraseText()` is removed (it doesn't exist in the UI)

### `components/ChatTab.js`
- Owns `conversations` (array ref) and `activeConversationId` (string ref)
- On mount: calls `initConversations()` from `storage.js`, sets initial state
- Passes both refs as props to `ChatSidebar` and `ChatMessages`
- Handles `select`, `delete`, `new-chat` events from `ChatSidebar` by delegating to methods also used by `ChatMessages`
- Layout: renders `<ChatSidebar>` + `<ChatMessages>` side by side

### `components/ChatSidebar.js`
- Props: `conversations`, `activeConversationId`
- Emits: `select(id)`, `delete(id)`, `new-chat`
- Renders the conversation list with delete buttons

### `components/ChatMessages.js`
- Props: `conversations`, `activeConversationId`
- Emits: `update-conversations(conversations)`, `update-active-id(id)`
- Local state: `chatHistory` (array, derived from active conversation on mount/prop change), `inputText`, `loading`
- Methods: `sendChatMessage()`, `switchConversation(id)`, `startNewChat()`, `deleteConversation(id)` — each emits updated state up to `ChatTab` after mutating localStorage via `storage.js`
- Renders messages; AI messages use `v-html` with `DOMPurify.sanitize(marked.parse(content))`
- Title generation after first exchange is unchanged
- Enter key (no shift) submits; handled via `@keydown` on the textarea

## Utils

### `utils/clipboard.js`
```js
export function copyToClipboard(text, iconEl) { ... }
```
Extracted verbatim from `script.js:1148`. `iconEl` is the button element passed from `$event.currentTarget` in the click handler.

### `utils/storage.js`
```js
export function loadConversations() { ... }
export function saveConversations(conversations) { ... }
export function enforceStorageCap(conversations) { ... }
export function generateId() { ... }
export function migrateOldHistory() { ... }
```
Extracted verbatim from `script.js`. No changes to logic.

## Tab Persistence

- URL hash (`#grammar`, `#paraphrase`, `#chat`) synced via `history.replaceState` on tab switch
- `hashchange` event handled in `main.js` to sync `activeTab` ref
- `localStorage.activeTab` also persisted

## Cleanups Included

- `showToast` inline CSS → `.toast` / `.toast-error` classes added to `style.css`
- `slideIn` / `slideOut` keyframe animations moved from runtime-injected `<style>` to `style.css`
- `clearRephraseText` bug (references non-existent `showDifferencesToggle`) fixed by removing the reference
- `window.fetch` monkey-patch for `isApplyingSuggestion` replaced with a direct ref toggle in `applySingleSuggestion`

## What Is Not Changing

- `style.css` (no modifications)
- `sw.js` (no modifications)
- `manifest.json` (no modifications)
- All API routes and backend code
- All class names and HTML structure (Vue templates mirror the existing DOM)
