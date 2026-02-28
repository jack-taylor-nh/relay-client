import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  conversations,
  selectedConversationId,
  loadConversations,
  isRefreshing,
  sendMessage,
  inboxSort,
  inboxFilter,
  archivedConversationIds,
  applyFilterAndSort,
  deleteConversation,
  archiveConversation,
  unarchiveConversation,
  renameConversation,
  loadInboxOverrides,
  type InboxSort,
  type InboxFilter,
} from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Inbox, RefreshCw, MessageSquare, X, ArrowUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Track if we're showing the detail panel in fullscreen
const showDetailPanel = signal(false);

// Module-level rename dialog signal
const renameDialog = signal<{ id: string; currentName: string } | null>(null);

const SORT_LABELS: Record<InboxSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  unread: 'Unread first',
  az: 'A → Z',
};

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: 'All',
  unread: 'Unread',
  archived: 'Archived',
};

function RenameDialog() {
  const target = renameDialog.value;
  const [name, setName] = useState(target?.currentName ?? '');
  if (!target) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-xl p-5 w-72">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">Rename conversation</h3>
        <input
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              renameConversation(target.id, name.trim());
              renameDialog.value = null;
            } else if (e.key === 'Escape') {
              renameDialog.value = null;
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={() => { renameDialog.value = null; }}>
            Cancel
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              if (name.trim()) {
                renameConversation(target.id, name.trim());
                renameDialog.value = null;
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FullscreenInboxView() {
  const allConvos = conversations.value;
  const isEmpty = allConvos.length === 0;
  const convos = applyFilterAndSort(allConvos);
  const selectedId = selectedConversationId.value;
  const refreshing = isRefreshing.value;

  // Load conversations when component mounts
  useEffect(() => {
    loadInboxOverrides().then(() => loadConversations());
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
      <div className="w-96 flex-shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Inbox</h2>
          <button
            className={cn(
              'p-2 rounded-md transition-all duration-150 bg-transparent border-none cursor-pointer',
              refreshing
                ? 'text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
            )}
            onClick={() => loadConversations()}
            disabled={refreshing}
            title="Refresh conversations"
          >
            <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Sort / Filter bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {(['all', 'unread', 'archived'] as InboxFilter[]).map((f) => (
              <button
                key={f}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-full capitalize transition-colors duration-150 bg-transparent border-none cursor-pointer',
                  inboxFilter.value === f
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
                )}
                onClick={() => { inboxFilter.value = f; }}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] bg-transparent border-none cursor-pointer transition-colors duration-150">
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {(Object.entries(SORT_LABELS) as [InboxSort, string][]).map(([s, label]) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => { inboxSort.value = s; }}
                  className="flex items-center gap-2"
                >
                  {inboxSort.value === s
                    ? <Check className="w-3.5 h-3.5" />
                    : <span className="w-3.5 h-3.5 inline-block" />}
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {convos.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
              {inboxFilter.value === 'unread' && 'No unread conversations.'}
              {inboxFilter.value === 'archived' && 'No archived conversations.'}
              {inboxFilter.value === 'all' && 'No conversations.'}
            </div>
          ) : (
            <div className="overflow-x-hidden">
            {convos.map((convo) => {
              const isArch = archivedConversationIds.value.has(convo.id);
              return (
                <ConversationItem
                  key={convo.id}
                  conversation={convo}
                  isSelected={selectedId === convo.id}
                  isArchived={isArch}
                  onClick={() => handleSelectConversation(convo.id)}
                  onRename={(id, currentName) => { renameDialog.value = { id, currentName }; }}
                  onArchive={isArch ? undefined : (id) => archiveConversation(id)}
                  onUnarchive={isArch ? (id) => unarchiveConversation(id) : undefined}
                  onDelete={(id) => deleteConversation(id)}
                />
              );
            })}
            </div>
          )}
        </ScrollArea>

        {/* Rename dialog */}
        <RenameDialog />
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
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <ConversationDetailView />
      </div>
    </div>
  );
}
