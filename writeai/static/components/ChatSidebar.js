export default {
  name: 'ChatSidebar',
  props: {
    conversations: { type: Array, required: true },
    activeConversationId: { type: String, required: true },
  },
  emits: ['select', 'delete', 'new-chat'],
  template: `
    <div id="chatSidebar">
      <button id="newChatBtn" @click="$emit('new-chat')">&#43; New Chat</button>
      <div id="conversationList">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === activeConversationId }"
          @click="$emit('select', conv.id)"
        >
          <span class="conversation-item-title">{{ conv.title }}</span>
          <button
            class="conversation-delete-btn"
            title="Delete conversation"
            @click.stop="$emit('delete', conv.id)"
          >🗑</button>
        </div>
      </div>
    </div>
  `,
};
