import { ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import {
  initConversations, saveConversations, enforceStorageCap,
  generateId, setActiveConversationId,
} from '../utils/storage.js';
import ChatSidebar  from './ChatSidebar.js';
import ChatMessages from './ChatMessages.js';

export default {
  name: 'ChatTab',
  components: { ChatSidebar, ChatMessages },
  setup() {
    const conversations        = ref([]);
    const activeConversationId = ref('');

    onMounted(() => {
      const init = initConversations();
      conversations.value        = init.conversations;
      activeConversationId.value = init.activeId;
    });

    function selectConversation(id) {
      if (id === activeConversationId.value) return;
      activeConversationId.value = id;
      setActiveConversationId(id);
    }

    function deleteConversation(id) {
      const convs = conversations.value.filter((c) => c.id !== id);
      if (id === activeConversationId.value) {
        if (convs.length === 0) {
          // Commit the deletion first so newChat() starts from a clean state.
          conversations.value = convs;
          newChat();
          return;
        }
        convs.sort((a, b) => b.createdAt - a.createdAt);
        activeConversationId.value = convs[0].id;
        setActiveConversationId(convs[0].id);
      }
      saveConversations(convs);
      conversations.value = convs;
    }

    function newChat() {
      const newConv = {
        id: generateId(), title: 'New conversation',
        createdAt: Date.now(), messages: [],
      };
      let convs = conversations.value.filter(
        (c) => c.messages.length > 0 || c.id === activeConversationId.value
      );
      convs.unshift(newConv);
      convs = enforceStorageCap(convs);
      saveConversations(convs);
      conversations.value        = convs;
      activeConversationId.value = newConv.id;
      setActiveConversationId(newConv.id);
    }

    function onUpdateConversations(convs) {
      conversations.value = convs;
    }

    return {
      conversations, activeConversationId,
      selectConversation, deleteConversation, newChat, onUpdateConversations,
    };
  },
  template: `
    <div class="tab-content active">
      <div class="tab-description">
        <p>Chat with an AI assistant about writing, grammar, or any other topic.</p>
      </div>
      <div class="chat-layout">
        <ChatSidebar
          :conversations="conversations"
          :activeConversationId="activeConversationId"
          @select="selectConversation"
          @delete="deleteConversation"
          @new-chat="newChat"
        />
        <ChatMessages
          :conversations="conversations"
          :activeConversationId="activeConversationId"
          @update-conversations="onUpdateConversations"
        />
      </div>
    </div>
  `,
};
