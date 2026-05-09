# Chat Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ChatGPT-style conversation sidebar to the AI Chat tab so users can start new chats, switch between past ones, and keep context manageable.

**Architecture:** All conversations are stored in `localStorage` as a JSON array under `grammarLlmConversations`. The chat tab layout splits into a 220px sidebar (conversation list + New Chat button) and the existing chat area. Title generation fires a second `/chat` call after the first AI response.

**Tech Stack:** Vanilla JS, HTML, CSS — no new dependencies. Uses `crypto.randomUUID()` for IDs (supported in all modern browsers).

---

## File Map

| File | Change |
|------|--------|
| `writeai/static/index.html` | Add `#chatSidebar` div inside `#chatSection` |
| `writeai/static/style.css` | Sidebar styles; `#chatSection` → flex row; `.tab-content.active` override for chat |
| `writeai/static/script.js` | Replace `loadChatHistory`/`saveChatHistory` with full conversation management; update `renderChatMessage`, `sendChatMessage` |

---

## Task 1: Data layer — conversation storage functions

**Files:**
- Modify: `writeai/static/script.js` (replace lines 680–704)

This task replaces the old flat `chatHistory`/`saveChatHistory` pair with the new multi-conversation data model. No UI changes yet — just the data functions.

- [ ] **Step 1: Remove old state variables and replace with new ones**

Find and replace the block starting at line 679 (`// AI Chat logic`) through line 704 (`}` closing `saveChatHistory`). Replace with:

```js
// AI Chat logic
const MAX_CONVERSATIONS = 50;
let chatHistory = []; // messages for the active conversation (in-memory mirror)
let activeConversationId = null;

function generateId() {
    return crypto.randomUUID();
}

function loadConversations() {
    try {
        return JSON.parse(localStorage.getItem('grammarLlmConversations') || '[]');
    } catch {
        return [];
    }
}

function saveConversations(conversations) {
    try {
        localStorage.setItem('grammarLlmConversations', JSON.stringify(conversations));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('Storage full — oldest conversations removed', true);
        }
    }
}

function getActiveConversation() {
    const conversations = loadConversations();
    return conversations.find(c => c.id === activeConversationId) || null;
}

function updateActiveConversationMessages() {
    const conversations = loadConversations();
    const idx = conversations.findIndex(c => c.id === activeConversationId);
    if (idx !== -1) {
        conversations[idx].messages = [...chatHistory];
        saveConversations(conversations);
    }
}

function enforceStorageCap(conversations) {
    if (conversations.length <= MAX_CONVERSATIONS) return conversations;
    return conversations
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_CONVERSATIONS);
}

function migrateOldHistory() {
    const old = localStorage.getItem('grammarLlmChatHistory');
    if (!old) return;
    try {
        const messages = JSON.parse(old);
        if (messages.length > 0) {
            const conversations = loadConversations();
            if (conversations.length === 0) {
                const migrated = {
                    id: generateId(),
                    title: 'Previous conversation',
                    createdAt: Date.now(),
                    messages
                };
                saveConversations([migrated]);
            }
        }
    } catch {
        // ignore malformed old data
    }
    localStorage.removeItem('grammarLlmChatHistory');
}
```

- [ ] **Step 2: Open the browser and verify no JS errors in the console**

Open `http://localhost:8000` (or wherever the dev server runs), open DevTools → Console. There should be no errors. The chat tab should still render (it won't work yet, but shouldn't crash).

- [ ] **Step 3: Commit**

```bash
git add writeai/static/script.js
git commit -m "feat: add conversation data layer functions"
```

---

## Task 2: Initialize and render conversations on load

**Files:**
- Modify: `writeai/static/script.js` — replace `loadChatHistory()` call in `DOMContentLoaded` and rewrite the function

- [ ] **Step 1: Replace `loadChatHistory` function**

Find and delete the old `loadChatHistory` function (lines 682–700). Add this new function in its place:

```js
function initConversations() {
    migrateOldHistory();
    let conversations = loadConversations();

    if (conversations.length === 0) {
        // First run — create an empty default conversation
        const first = {
            id: generateId(),
            title: 'New conversation',
            createdAt: Date.now(),
            messages: []
        };
        conversations = [first];
        saveConversations(conversations);
    }

    // Set active to the most recent
    conversations.sort((a, b) => b.createdAt - a.createdAt);
    activeConversationId = localStorage.getItem('grammarLlmActiveConversationId') || conversations[0].id;

    // Validate stored active ID still exists
    if (!conversations.find(c => c.id === activeConversationId)) {
        activeConversationId = conversations[0].id;
    }
    localStorage.setItem('grammarLlmActiveConversationId', activeConversationId);

    const active = conversations.find(c => c.id === activeConversationId);
    chatHistory = active ? [...active.messages] : [];

    renderChatHistoryView();
    renderSidebar();
}
```

- [ ] **Step 2: Replace `loadChatHistory()` call in `DOMContentLoaded`**

Find this line in the `DOMContentLoaded` listener:
```js
    loadChatHistory();
```
Replace it with:
```js
    initConversations();
```

- [ ] **Step 3: Add `renderChatHistoryView` function**

Add this function right after `initConversations`. It uses DOM construction (not innerHTML with dynamic content) to avoid XSS:

```js
function renderChatHistoryView() {
    const chatHistoryDiv = document.getElementById('chatHistory');
    chatHistoryDiv.textContent = ''; // safe clear
    if (chatHistory.length === 0) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message ai-message';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = "Hello! I'm your AI assistant. How can I help you today?";
        welcomeDiv.appendChild(contentDiv);
        chatHistoryDiv.appendChild(welcomeDiv);
        return;
    }
    chatHistory.forEach(msg => renderChatMessage(msg.role, msg.content, false));
    scrollToBottom();
}
```

- [ ] **Step 4: Add stub `renderSidebar` function** (we'll flesh it out in Task 5 — for now just a no-op so no errors)

```js
function renderSidebar() {
    // implemented in Task 5
}
```

- [ ] **Step 5: Verify in browser**

Refresh the page, open the chat tab. The welcome message should appear. No console errors.

- [ ] **Step 6: Commit**

```bash
git add writeai/static/script.js
git commit -m "feat: initialize conversations from localStorage on load"
```

---

## Task 3: HTML — add sidebar markup

**Files:**
- Modify: `writeai/static/index.html` lines 127–147

- [ ] **Step 1: Replace the `#chatSection` contents**

Find this block in `index.html`:
```html
        <div id="chatSection" class="tab-content">
            <div class="tab-description">
                <p>Chat with an AI assistant about writing, grammar, or any other topic. Your conversation history is
                    saved automatically.</p>
            </div>
            <div class="chat-container">
                <div id="chatHistory" class="chat-history">
                    <div class="message ai-message">
                        <div class="message-content">
                            Hello! I'm your AI assistant. How can I help you today?
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <textarea id="chatInput"
                        placeholder="Ask me anything... (e.g., 'Explain the difference between its and it\'s')"
                        rows="3"></textarea>
                    <button id="sendChatBtn" onclick="sendChatMessage()">Send</button>
                </div>
            </div>
        </div>
```

Replace with:
```html
        <div id="chatSection" class="tab-content">
            <div class="tab-description">
                <p>Chat with an AI assistant about writing, grammar, or any other topic.</p>
            </div>
            <div class="chat-layout">
                <div id="chatSidebar">
                    <button id="newChatBtn" onclick="startNewChat()">&#43; New Chat</button>
                    <div id="conversationList"></div>
                </div>
                <div class="chat-container">
                    <div id="chatHistory" class="chat-history"></div>
                    <div class="chat-input-area">
                        <textarea id="chatInput"
                            placeholder="Ask me anything... (e.g., 'Explain the difference between its and it\'s')"
                            rows="3"></textarea>
                        <button id="sendChatBtn" onclick="sendChatMessage()">Send</button>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 2: Verify in browser**

Refresh. The chat tab should render (sidebar will be unstyled and empty, but no crash).

- [ ] **Step 3: Commit**

```bash
git add writeai/static/index.html
git commit -m "feat: add sidebar markup to chat tab"
```

---

## Task 4: CSS — sidebar and layout styles

**Files:**
- Modify: `writeai/static/style.css`

- [ ] **Step 1: Add `#chatSection.active` flex override**

Find the `.tab-content.active` rule (around line 253):
```css
.tab-content.active {
    display: block;
}
```
Add a new rule immediately after it:
```css
#chatSection.active {
    display: flex;
    flex-direction: column;
}
```

- [ ] **Step 2: Add `.chat-layout` and sidebar styles**

Find `.chat-container` (around line 982) and add the following styles before it:

```css
.chat-layout {
    display: flex;
    flex-direction: row;
    gap: var(--space-lg);
    flex: 1;
    min-height: 0;
}

#chatSidebar {
    width: 220px;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    background: white;
    border-radius: var(--radius-xl);
    padding: var(--space-md);
    border: 1px solid var(--gray-200);
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    overflow: hidden;
}

body.dark-mode #chatSidebar {
    background: var(--dark-surface);
    border-color: var(--dark-border);
}

#newChatBtn {
    width: 100%;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    flex-shrink: 0;
}

#newChatBtn:hover {
    background: var(--primary-dark);
}

#conversationList {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

#conversationList::-webkit-scrollbar {
    width: 4px;
}

#conversationList::-webkit-scrollbar-thumb {
    background: var(--gray-300);
    border-radius: 2px;
}

.conversation-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--gray-700);
    gap: 6px;
}

.conversation-item:hover {
    background: var(--gray-100);
}

.conversation-item.active {
    background: #dbeafe;
    color: #1e40af;
}

body.dark-mode .conversation-item:hover {
    background: rgba(255,255,255,0.06);
}

body.dark-mode .conversation-item.active {
    background: rgba(59,130,246,0.2);
    color: #93c5fd;
}

.conversation-item-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.conversation-delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--gray-400);
    font-size: 0.8rem;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
}

.conversation-item:hover .conversation-delete-btn {
    opacity: 1;
}

.conversation-item.active .conversation-delete-btn {
    opacity: 0.5;
}

.conversation-item.active .conversation-delete-btn:hover {
    opacity: 1;
    color: #ef4444;
}
```

- [ ] **Step 3: Update `.chat-container` to grow within the flex row**

Find the existing `.chat-container {` rule. Add `flex: 1;` and `min-width: 0;` inside it (the other properties stay unchanged).

- [ ] **Step 4: Add responsive rule**

Find the `@media (max-width: 1024px)` block and add inside it:
```css
    .chat-layout {
        flex-direction: column;
    }

    #chatSidebar {
        width: 100%;
        min-width: unset;
        max-height: 180px;
    }
```

- [ ] **Step 5: Verify in browser**

Refresh. The chat tab should show the styled sidebar on the left (empty but styled) and the chat area on the right. Resize below 1024px — sidebar should stack above.

- [ ] **Step 6: Commit**

```bash
git add writeai/static/style.css
git commit -m "feat: add sidebar layout and conversation item styles"
```

---

## Task 5: Implement `renderSidebar` and conversation switching

**Files:**
- Modify: `writeai/static/script.js`

- [ ] **Step 1: Replace the stub `renderSidebar` with the real implementation**

Find and replace:
```js
function renderSidebar() {
    // implemented in Task 5
}
```

With:
```js
function renderSidebar() {
    const list = document.getElementById('conversationList');
    if (!list) return;
    const conversations = loadConversations();
    conversations.sort((a, b) => b.createdAt - a.createdAt);

    list.textContent = ''; // safe clear
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv.id === activeConversationId ? ' active' : '');
        item.dataset.id = conv.id;

        const title = document.createElement('span');
        title.className = 'conversation-item-title';
        title.textContent = conv.title;

        const delBtn = document.createElement('button');
        delBtn.className = 'conversation-delete-btn';
        delBtn.title = 'Delete conversation';
        delBtn.textContent = '🗑';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });

        item.appendChild(title);
        item.appendChild(delBtn);
        item.addEventListener('click', () => switchConversation(conv.id));
        list.appendChild(item);
    });
}
```

- [ ] **Step 2: Add `switchConversation` function**

```js
function switchConversation(id) {
    if (id === activeConversationId) return;
    updateActiveConversationMessages();
    activeConversationId = id;
    localStorage.setItem('grammarLlmActiveConversationId', id);

    const conversations = loadConversations();
    const conv = conversations.find(c => c.id === id);
    chatHistory = conv ? [...conv.messages] : [];
    renderChatHistoryView();
    renderSidebar();
    document.getElementById('chatInput').focus();
}
```

- [ ] **Step 3: Add `startNewChat` function**

```js
function startNewChat() {
    updateActiveConversationMessages();
    const newConv = {
        id: generateId(),
        title: 'New conversation',
        createdAt: Date.now(),
        messages: []
    };
    let conversations = loadConversations();
    conversations.unshift(newConv);
    conversations = enforceStorageCap(conversations);
    saveConversations(conversations);
    activeConversationId = newConv.id;
    localStorage.setItem('grammarLlmActiveConversationId', activeConversationId);
    chatHistory = [];
    renderChatHistoryView();
    renderSidebar();
    document.getElementById('chatInput').focus();
}
```

- [ ] **Step 4: Add `deleteConversation` function**

```js
function deleteConversation(id) {
    let conversations = loadConversations();
    conversations = conversations.filter(c => c.id !== id);
    saveConversations(conversations);

    if (id === activeConversationId) {
        if (conversations.length === 0) {
            startNewChat();
            return;
        }
        conversations.sort((a, b) => b.createdAt - a.createdAt);
        switchConversation(conversations[0].id);
        return;
    }
    renderSidebar();
}
```

- [ ] **Step 5: Verify in browser**

Refresh. The sidebar should list "New conversation". Click "New Chat" several times — new items should appear. Click between them — the chat view should switch. Clicking 🗑 should remove the item and switch to the next one.

- [ ] **Step 6: Commit**

```bash
git add writeai/static/script.js
git commit -m "feat: implement sidebar render, conversation switching, new chat, delete"
```

---

## Task 6: Wire up message saving to active conversation

**Files:**
- Modify: `writeai/static/script.js` — update `renderChatMessage`

- [ ] **Step 1: Update `renderChatMessage` to save to active conversation**

Find the existing `renderChatMessage` function. Replace the `if (save)` block at the bottom:

```js
    if (save) {
        chatHistory.push({ role, content });
        saveChatHistory();
    }
```

With:

```js
    if (save) {
        chatHistory.push({ role, content });
        updateActiveConversationMessages();
        renderSidebar();
    }
```

- [ ] **Step 2: Verify in browser**

Send a message in the chat. Refresh the page, switch back to the chat tab — the message should still be there.

- [ ] **Step 3: Commit**

```bash
git add writeai/static/script.js
git commit -m "feat: persist messages to active conversation on send"
```

---

## Task 7: Auto-generate conversation title after first exchange

**Files:**
- Modify: `writeai/static/script.js` — add title generation, update `sendChatMessage`

- [ ] **Step 1: Add `generateConversationTitle` function**

Add this function near the other conversation management functions:

```js
async function generateConversationTitle(firstUserMessage, firstAiResponse) {
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Summarize this conversation topic in 6 words or fewer.',
                history: [
                    { role: 'user', content: firstUserMessage },
                    { role: 'assistant', content: firstAiResponse }
                ]
            })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.response ? data.response.trim().replace(/['"]/g, '') : null;
    } catch {
        return null;
    }
}
```

- [ ] **Step 2: Update `sendChatMessage` to set placeholder title and trigger generation**

Find `sendChatMessage`. After the line `renderChatMessage('assistant', data.response);` add:

```js
        // Generate title after first exchange
        const isFirstExchange = chatHistory.filter(m => m.role === 'user').length === 1;
        if (isFirstExchange) {
            // Set placeholder title immediately using first 40 chars of user message
            const conversations = loadConversations();
            const idx = conversations.findIndex(c => c.id === activeConversationId);
            if (idx !== -1 && conversations[idx].title === 'New conversation') {
                conversations[idx].title = message.slice(0, 40);
                saveConversations(conversations);
                renderSidebar();
            }
            // Generate real title in background — no await
            generateConversationTitle(message, data.response).then(title => {
                if (!title) return;
                const convs = loadConversations();
                const i = convs.findIndex(c => c.id === activeConversationId);
                if (i !== -1) {
                    convs[i].title = title;
                    saveConversations(convs);
                    renderSidebar();
                }
            });
        }
```

- [ ] **Step 3: Verify in browser**

Start a new chat. Send a message. The sidebar item should immediately update from "New conversation" to the first 40 chars of your message, then update again a moment later with the AI-generated title.

- [ ] **Step 4: Commit**

```bash
git add writeai/static/script.js
git commit -m "feat: auto-generate conversation title after first exchange"
```

---

## Task 8: End-to-end verification and polish

**Files:**
- Modify: `writeai/static/style.css` (fixes only if needed)

- [ ] **Step 1: Verify dark mode**

Toggle dark mode. Check that the sidebar background, text, active item highlight, and delete button all look correct.

- [ ] **Step 2: Verify responsive layout**

Resize the browser window below 1024px wide. The sidebar should stack above the chat area (full width, capped at 180px height).

- [ ] **Step 3: Fix any visual issues found**

If anything looks off (colors, overflow, truncation), fix those CSS rules.

- [ ] **Step 4: Full end-to-end checklist**

- [ ] Start a new conversation, send a message, see title update from placeholder to AI-generated
- [ ] Start another new conversation, verify the first one is still in the list
- [ ] Switch back to the first conversation, verify messages are intact
- [ ] Delete a non-active conversation, verify it disappears without switching
- [ ] Delete the active conversation, verify switch to next most recent
- [ ] Delete all conversations, verify a fresh empty one is created automatically
- [ ] Refresh the page, verify all conversations and active state persist

- [ ] **Step 5: Commit**

```bash
git add writeai/static/style.css writeai/static/script.js
git commit -m "feat: chat conversation history sidebar complete"
```
