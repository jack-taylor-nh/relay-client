import type { Conversation, ConversationType, SecurityLevel } from '../../types';

interface Props {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function OriginIcon({ type }: { type: ConversationType }) {
  switch (type) {
    case 'native':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      );
    case 'email':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'contact_endpoint':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

function SecurityBadge({ level }: { level: SecurityLevel }) {
  switch (level) {
    case 'e2ee':
      return (
        <span class="text-xs text-emerald-600 opacity-70" title="End-to-end encrypted">
          E2EE
        </span>
      );
    case 'gateway_secured':
      return (
        <span class="text-xs text-cyan-600 opacity-70" title="Relayed (gateway secured)">
          Relayed
        </span>
      );
    case 'mixed':
      return (
        <span class="text-xs text-amber-600 opacity-90" title="Mixed security levels">
          Mixed
        </span>
      );
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationItem({ conversation, isSelected, onClick }: Props) {
  const isUnread = conversation.isUnread ?? (conversation.unreadCount ?? 0) > 0;
  const securityLevel = conversation.securityLevel || 'e2ee';
  const hasPreview = conversation.lastMessagePreview && conversation.lastMessagePreview.trim().length > 0;

  return (
    <button 
      class={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors duration-150 ${
        isSelected ? 'bg-stone-200' : 'hover:bg-stone-100'
      }`}
      onClick={onClick}
    >
      <div class={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${
        isUnread ? 'bg-sky-500 text-white' : 'bg-stone-100 text-stone-600'
      }`}>
        <div class="w-4 h-4">
          <OriginIcon type={conversation.type} />
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 mb-0.5">
          <span class={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'} text-stone-900 whitespace-nowrap overflow-hidden text-ellipsis`}>
            {conversation.counterpartyName || 'Unknown'}
          </span>
          <div class="flex items-center gap-1 flex-shrink-0">
            <SecurityBadge level={securityLevel} />
            <span class={`flex-shrink-0 text-xs ${isUnread ? 'text-stone-600 font-medium' : 'text-stone-400'}`}>
              {formatTime(conversation.lastActivityAt)}
            </span>
          </div>
        </div>
        {hasPreview && (
          <div class={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${
            isUnread ? 'text-stone-700' : 'text-stone-500'
          }`}>
            {conversation.lastMessagePreview}
          </div>
        )}
      </div>
    </button>
  );
}
