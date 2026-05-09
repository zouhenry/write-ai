const STORAGE_KEY = 'grammarLlmConversations';
const ACTIVE_KEY  = 'grammarLlmActiveConversationId';
export const MAX_CONVERSATIONS = 50;

export function generateId() {
  return crypto.randomUUID();
}

export function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveConversations(conversations) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.error('saveConversations failed:', e);
    throw e;
  }
}

export function enforceStorageCap(conversations) {
  if (conversations.length <= MAX_CONVERSATIONS) return conversations;
  return [...conversations]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_CONVERSATIONS);
}

export function getActiveConversationId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveConversationId(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function migrateOldHistory() {
  const old = localStorage.getItem('grammarLlmChatHistory');
  if (!old) return;
  try {
    const messages = JSON.parse(old);
    if (messages.length > 0) {
      const conversations = loadConversations();
      if (conversations.length === 0) {
        saveConversations([{
          id: generateId(),
          title: 'Previous conversation',
          createdAt: Date.now(),
          messages,
        }]);
      }
    }
  } catch {
    // ignore malformed data
  }
  localStorage.removeItem('grammarLlmChatHistory');
}

export function initConversations() {
  migrateOldHistory();
  let conversations = loadConversations();
  if (conversations.length === 0) {
    const first = {
      id: generateId(),
      title: 'New conversation',
      createdAt: Date.now(),
      messages: [],
    };
    conversations = [first];
    saveConversations(conversations);
  }
  conversations.sort((a, b) => b.createdAt - a.createdAt);
  let activeId = getActiveConversationId() || conversations[0].id;
  if (!conversations.find((c) => c.id === activeId)) {
    activeId = conversations[0].id;
  }
  setActiveConversationId(activeId);
  return { conversations, activeId };
}
