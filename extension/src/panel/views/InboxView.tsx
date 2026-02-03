import { useEffect } from 'preact/hooks';
import { conversations, selectedConversationId, loadConversations, isRefreshing } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';

export function InboxView() {
  const convos = conversations.value;
  const isEmpty = convos.length === 0;
  const hasSelection = selectedConversationId.value !== null;
  const refreshing = isRefreshing.value;

  // Load conversations when component mounts
  useEffect(() => {
    loadConversations();
  }, []);

  // Show conversation detail if one is selected
  if (hasSelection) {
    return <ConversationDetailView />;
  }

  if (isEmpty) {
    return (
      <div class="flex flex-col items-center justify-center h-full text-center px-5 py-10 bg-stone-50">
        <svg class="w-12 h-12 text-stone-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 12h-6l-2 3H10l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
        <h3 class="text-lg font-semibold text-stone-900 mb-2">No conversations yet</h3>
        <p class="text-sm text-stone-600 mb-4">Start a chat with another handle or create an email alias to receive messages.</p>
        <button 
          class="px-4 py-2.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-md transition-colors duration-150"
          onClick={() => { activeTab.value = 'new'; }}
        >
          Start a chat
        </button>
      </div>
    );
  }

  return (
    <div class="flex-1 overflow-y-auto flex flex-col">
      {/* Header with refresh button */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-white">
        <h2 class="text-lg font-semibold text-stone-900">Inbox</h2>
        <button
          class={`p-2 rounded-md transition-all duration-150 ${refreshing ? 'text-sky-600' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'}`}
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
            isSelected={selectedConversationId.value === convo.id}
            onClick={() => {
              selectedConversationId.value = convo.id;
            }}
          />
        ))}
      </div>
    </div>
  );
}
