import { useEffect } from 'preact/hooks';
import { Inbox, RefreshCw } from 'lucide-react';
import { conversations, selectedConversationId, loadConversations, isRefreshing } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/relay/EmptyState';
import { cn } from '@/lib/utils';

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
      <EmptyState
        icon={<Inbox className="w-12 h-12" strokeWidth={1.5} />}
        title="No conversations yet"
        description="Start a chat with another handle or create an email alias to receive messages."
        action={{
          label: "Start a chat",
          onClick: () => { activeTab.value = 'new'; },
          variant: "accent"
        }}
        className="h-full bg-[hsl(var(--muted))]"
      />
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Inbox</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadConversations()}
          disabled={refreshing}
          aria-label="Refresh conversations"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-[hsl(var(--border))]">
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
      </ScrollArea>
    </div>
  );
}
