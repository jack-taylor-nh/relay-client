import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Inbox, RefreshCw, ArrowUpDown, Check } from 'lucide-react';
import {
  conversations,
  selectedConversationId,
  loadConversations,
  isRefreshing,
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
import { EmptyState } from '@/components/relay/EmptyState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Module-level signal so dialog survives the hasSelection early return
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

export function InboxView() {
  const allConvos = conversations.value;
  const isEmpty = allConvos.length === 0;
  const hasSelection = selectedConversationId.value !== null;
  const refreshing = isRefreshing.value;
  const convos = applyFilterAndSort(allConvos);

  useEffect(() => {
    loadInboxOverrides().then(() => loadConversations());
  }, []);

  if (hasSelection) {
    return (
      <div className="relative flex-1 overflow-hidden flex flex-col">
        <ConversationDetailView />
        <RenameDialog />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Inbox className="w-12 h-12" strokeWidth={1.5} />}
        title="No conversations yet"
        description="Start a chat with another handle or create an email alias to receive messages."
        action={{
          label: 'Start a chat',
          onClick: () => { activeTab.value = 'new'; },
          variant: 'accent',
        }}
        className="h-full bg-[hsl(var(--muted))]"
      />
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Inbox</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadConversations()}
          disabled={refreshing}
          aria-label="Refresh conversations"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Sort / Filter bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Filter pills */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {(['all', 'unread', 'archived'] as InboxFilter[]).map((f) => (
            <button
              key={f}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full capitalize transition-colors duration-150 bg-transparent border-none cursor-pointer',
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
        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] bg-transparent border-none cursor-pointer transition-colors duration-150">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{SORT_LABELS[inboxSort.value]}</span>
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
          <div className="px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
            {inboxFilter.value === 'unread' && 'No unread conversations.'}
            {inboxFilter.value === 'archived' && 'No archived conversations.'}
            {inboxFilter.value === 'all' && 'No conversations match your filters.'}
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))] overflow-x-hidden">
            {convos.map((convo) => {
              const isArch = archivedConversationIds.value.has(convo.id);
              return (
                <ConversationItem
                  key={convo.id}
                  conversation={convo}
                  isSelected={selectedConversationId.value === convo.id}
                  isArchived={isArch}
                  onClick={() => { selectedConversationId.value = convo.id; }}
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

      {/* Rename dialog overlay */}
      <RenameDialog />
    </div>
  );
}
