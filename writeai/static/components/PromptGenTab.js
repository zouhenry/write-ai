import {
  ref,
  watch,
  computed,
  onMounted,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { createStorageAdapter } from '../utils/storage.js';
import ChatSidebar from './ChatSidebar.js';
import ChatMessages from './ChatMessages.js';

const BANNER_KEY = 'banner_dismissed_prompt_gen';
const storage = createStorageAdapter('promptGenConversations', 'promptGenActiveId');

const USE_CASES = [
  { value: 'general',          label: 'General' },
  { value: 'coding',           label: 'Coding' },
  { value: 'remix_architect',  label: 'Remix Architect' },
  { value: 'creative_writing', label: 'Creative Writing' },
  { value: 'data_analysis',    label: 'Data Analysis' },
  { value: 'summarization',    label: 'Summarization' },
];

export default {
  name: 'PromptGenTab',
  components: { ChatSidebar, ChatMessages },
  setup() {
    const conversations = ref([]);
    const activeConversationId = ref('');
    const bannerVisible = ref(false);
    const useCase = ref('general');
    const rawInput = ref('');

    const conversationHasMessages = computed(() => {
      const conv = conversations.value.find((c) => c.id === activeConversationId.value);
      return conv ? conv.messages.length > 0 : false;
    });

    onMounted(() => {
      const init = storage.initConversations();
      conversations.value = init.conversations;
      activeConversationId.value = init.activeId;
      bannerVisible.value = !localStorage.getItem(BANNER_KEY);
      syncUseCaseFromActive();
    });

    function syncUseCaseFromActive() {
      const conv = conversations.value.find((c) => c.id === activeConversationId.value);
      useCase.value = conv?.useCase || 'general';
      rawInput.value = conv?.rawInput || '';
    }

    watch(activeConversationId, syncUseCaseFromActive);

    function dismissBanner() {
      bannerVisible.value = false;
      localStorage.setItem(BANNER_KEY, '1');
    }

    function selectConversation(id) {
      if (id === activeConversationId.value) return;
      activeConversationId.value = id;
      storage.setActiveConversationId(id);
    }

    function deleteConversation(id) {
      const convs = conversations.value.filter((c) => c.id !== id);
      if (id === activeConversationId.value) {
        if (convs.length === 0) {
          conversations.value = convs;
          newChat();
          return;
        }
        convs.sort((a, b) => b.createdAt - a.createdAt);
        activeConversationId.value = convs[0].id;
        storage.setActiveConversationId(convs[0].id);
      }
      storage.saveConversations(convs);
      conversations.value = convs;
    }

    function newChat() {
      const newConv = {
        id: storage.generateId(),
        title: 'New conversation',
        createdAt: Date.now(),
        messages: [],
      };
      let convs = conversations.value.filter(
        (c) => c.messages.length > 0 || c.id === activeConversationId.value,
      );
      convs.unshift(newConv);
      convs = storage.enforceStorageCap(convs);
      storage.saveConversations(convs);
      conversations.value = convs;
      activeConversationId.value = newConv.id;
      storage.setActiveConversationId(newConv.id);
    }

    function onUpdateConversations(convs) {
      // Stamp useCase onto the active conversation so it survives reload
      const stamped = convs.map((c) =>
        c.id === activeConversationId.value
          ? { ...c, useCase: useCase.value, rawInput: rawInput.value }
          : c,
      );
      storage.saveConversations(stamped);
      conversations.value = stamped;
    }

    function onUpdateRawInput(val) {
      rawInput.value = val;
    }

    function onUseCaseChange() {
      // Stamp updated useCase immediately on the active conversation
      const stamped = conversations.value.map((c) =>
        c.id === activeConversationId.value ? { ...c, useCase: useCase.value } : c,
      );
      storage.saveConversations(stamped);
      conversations.value = stamped;
    }

    return {
      conversations,
      activeConversationId,
      bannerVisible,
      useCase,
      rawInput,
      conversationHasMessages,
      USE_CASES,
      dismissBanner,
      selectConversation,
      deleteConversation,
      newChat,
      onUpdateConversations,
      onUpdateRawInput,
      onUseCaseChange,
    };
  },
  template: `
    <div class="tab-content active chat-tab-content">
      <div v-if="bannerVisible" class="tab-description">
        <p>Describe your prompt idea, select a use case, and let AI refine it into a structured prompt.</p>
        <button class="banner-dismiss" @click="dismissBanner" aria-label="Dismiss">&#x2715;</button>
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
          :endpoint="'/prompt-gen'"
          :streaming="false"
          :rawInput="rawInput"
          :useCase="useCase"
          :storageAdapter="storage"
          @update-conversations="onUpdateConversations"
          @update:rawInput="onUpdateRawInput"
        >
          <div class="prompt-gen-controls">
            <label class="prompt-gen-select-label">Use case</label>
            <select
              v-model="useCase"
              class="prompt-gen-select"
              :disabled="conversationHasMessages"
              @change="onUseCaseChange"
            >
              <option v-for="uc in USE_CASES" :key="uc.value" :value="uc.value">{{ uc.label }}</option>
            </select>
          </div>
        </ChatMessages>
      </div>
    </div>
  `,
};
