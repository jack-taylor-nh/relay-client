import { conversations, selectedConversationId } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';

export function InboxView() {
  const convos = conversations.value;
  const isEmpty = convos.length === 0;
  const hasSelection = selectedConversationId.value !== null;

  // Show conversation detail if one is selected
  if (hasSelection) {
    return <ConversationDetailView />;
  }

  if (isEmpty) {
    return (
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 12h-6l-2 3H10l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
        <h3>No conversations yet</h3>
        <p>Start a chat with another handle or create an email alias to receive messages.</p>
        <button class="btn btn-primary" onClick={() => { activeTab.value = 'new'; }}>
          Start a chat
        </button>
        <style>{`
          .empty-icon {
            width: 48px;
            height: 48px;
            color: var(--color-text-tertiary);
            margin-bottom: var(--space-4);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div class="inbox-view">
      <div class="conversation-list">
        {convos.map((convo) => (
          <ConversationItem
            key={convo.id}
            conversation={convo}
            isSelected={selectedConversationId.value === convo.id}
            onClick={() => {
              selectedConversationId.value = convo.id;
            }}
          />
        ))}
      </div>
      <style>{`
        .inbox-view {
          flex: 1;
          overflow-y: auto;
        }
        
        .conversation-list {
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}
