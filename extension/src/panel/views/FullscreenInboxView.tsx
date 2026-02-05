import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { conversations, selectedConversationId, loadConversations, isRefreshing, sendMessage } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';

// Track if we're showing the detail panel in fullscreen
const showDetailPanel = signal(false);

export function FullscreenInboxView() {
  const convos = conversations.value;
  const isEmpty = convos.length === 0;
  const selectedId = selectedConversationId.value;
  const refreshing = isRefreshing.value;

  // Load conversations when component mounts
  useEffect(() => {
    loadConversations();
  }, []);

  // When a conversation is selected, show the detail panel
  useEffect(() => {
    if (selectedId) {
      showDetailPanel.value = true;
    }
  }, [selectedId]);

  function handleSelectConversation(id: string) {
    selectedConversationId.value = id;
    showDetailPanel.value = true;
    // Mark as seen when opened
    sendMessage({ type: 'MARK_CONVERSATION_SEEN', payload: { conversationId: id } });
  }

  function handleCloseDetail() {
    showDetailPanel.value = false;
    selectedConversationId.value = null;
  }

  if (isEmpty) {
    return (
      <div class="flex h-full">
        {/* Empty state - full width */}
        <div class="flex-1 flex flex-col items-center justify-center text-center px-5 py-10 bg-[var(--color-bg-sunken)]">
          <svg class="w-16 h-16 text-[var(--color-text-tertiary)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-6l-2 3H10l-2-3H2" />
            <path d="M5.45 5.11L2 12v6a2 2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
          </svg>
          <h3 class="text-xl font-semibold text-[var(--color-text-primary)] mb-2">No conversations yet</h3>
          <p class="text-base text-[var(--color-text-secondary)] mb-6 max-w-md">
            Start a chat with another handle or create an edge to receive messages from email, Discord, and more.
          </p>
          <button 
            class="px-6 py-3 text-base font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-lg transition-colors duration-150"
            onClick={() => { activeTab.value = 'new'; }}
          >
            Start a conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="flex h-full">
      {/* Conversation List - Left Panel */}
      <div class="w-80 flex-shrink-0 flex flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
        {/* Header with refresh button */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-default)]">
          <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Inbox</h2>
          <button
            class={`p-2 rounded-md transition-all duration-150 ${refreshing ? 'text-sky-600' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'}`}
            onClick={() => loadConversations()}
            disabled={refreshing}
            title="Refresh conversations"
          >
            <svg 
              class={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 11-2.52-6.25" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {/* Conversation list */}
        <div class="flex-1 overflow-y-auto">
          {convos.map((convo) => (
            <ConversationItem
              key={convo.id}
              conversation={convo}
              isSelected={selectedId === convo.id}
              onClick={() => handleSelectConversation(convo.id)}
            />
          ))}
        </div>
      </div>

      {/* Message Detail - Right Panel */}
      <div class="flex-1 flex flex-col bg-[var(--color-bg-sunken)]">
        {showDetailPanel.value && selectedId ? (
          <FullscreenConversationDetail onClose={handleCloseDetail} />
        ) : (
          <div class="flex-1 flex flex-col items-center justify-center text-center px-5">
            <svg class="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p class="text-[var(--color-text-tertiary)]">Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper for ConversationDetailView with close button for fullscreen
function FullscreenConversationDetail({ onClose }: { onClose: () => void }) {
  return (
    <div class="flex-1 flex flex-col h-full">
      {/* Close button bar at top */}
      <div class="flex items-center justify-end px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border-default)]">
        <button
          class="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] rounded-md transition-all"
          onClick={onClose}
          title="Close conversation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-hidden">
        <ConversationDetailView />
      </div>
    </div>
  );
}
