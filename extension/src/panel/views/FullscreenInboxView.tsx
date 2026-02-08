import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { conversations, selectedConversationId, loadConversations, isRefreshing, sendMessage } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Inbox, RefreshCw, MessageSquare, X } from 'lucide-react';

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
      <div className="flex h-full">
        {/* Empty state - full width */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-10 bg-[hsl(var(--background))]">
          <Inbox className="w-16 h-16 text-[hsl(var(--muted-foreground))] mb-4" strokeWidth={1.5} />
          <h3 className="text-xl font-semibold text-[hsl(var(--foreground))] mb-2">No conversations yet</h3>
          <p className="text-base text-[hsl(var(--muted-foreground))] mb-6 max-w-md">
            Start a chat with another handle or create an edge to receive messages from email, Discord, and more.
          </p>
          <Button 
            variant="accent"
            onClick={() => { activeTab.value = 'new'; }}
          >
            Start a conversation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Conversation List - Left Panel */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Header with refresh button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Inbox</h2>
          <button
            className={`p-2 rounded-md transition-all duration-150 bg-transparent border-none cursor-pointer ${refreshing ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'}`}
            onClick={() => loadConversations()}
            disabled={refreshing}
            title="Refresh conversations"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {convos.map((convo) => (
            <ConversationItem
              key={convo.id}
              conversation={convo}
              isSelected={selectedId === convo.id}
              onClick={() => handleSelectConversation(convo.id)}
            />
          ))}
        </ScrollArea>
      </div>

      {/* Message Detail - Right Panel */}
      <div className="flex-1 flex flex-col bg-[hsl(var(--background))]">
        {showDetailPanel.value && selectedId ? (
          <FullscreenConversationDetail onClose={handleCloseDetail} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-5">
            <MessageSquare className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-4" strokeWidth={1.5} />
            <p className="text-[hsl(var(--muted-foreground))]">Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper for ConversationDetailView with close button for fullscreen
function FullscreenConversationDetail({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Close button bar at top */}
      <div className="flex items-center justify-end px-4 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <button
          className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] rounded-md transition-all bg-transparent border-none cursor-pointer"
          onClick={onClose}
          title="Close conversation"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ConversationDetailView />
      </div>
    </div>
  );
}
