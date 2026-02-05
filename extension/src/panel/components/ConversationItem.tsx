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
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      );
    case 'webhook':
      return (
        // Tabler webhook icon
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.876 13.61a4 4 0 1 0 6.124 3.39h6"/>
          <path d="M15.066 20.502a4 4 0 1 0 1.934 -7.502c-.706 0 -1.424 .179 -2 .5l-3 -5.5"/>
          <path d="M16 8a4 4 0 1 0 -8 0c0 1.506 .77 2.818 2 3.5l-3 5.5"/>
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

// Security level descriptions for tooltips
const SECURITY_DESCRIPTIONS = {
  e2ee: 'End-to-End Encrypted: Messages are encrypted on your device and can only be decrypted by the recipient. No server, including Relay, can read your messages.',
  gateway_secured: 'Relayed: Messages are encrypted in transit (TLS) and at rest, but pass through a bridge gateway. The bridge can process message content to enable cross-platform messaging (e.g., Discord, Email).',
  mixed: 'Mixed Security: This conversation contains messages with different security levels. Some messages may be E2EE while others are relayed through a bridge.',
};

function SecurityBadge({ level }: { level: SecurityLevel }) {
  switch (level) {
    case 'e2ee':
      return (
        <span 
          class="text-xs text-emerald-600 opacity-70 cursor-help border-b border-dotted border-emerald-400" 
          title={SECURITY_DESCRIPTIONS.e2ee}
        >
          E2EE
        </span>
      );
    case 'gateway_secured':
      return (
        <span 
          class="text-xs text-cyan-600 opacity-70 cursor-help border-b border-dotted border-cyan-400" 
          title={SECURITY_DESCRIPTIONS.gateway_secured}
        >
          Relayed
        </span>
      );
    case 'mixed':
      return (
        <span 
          class="text-xs text-amber-600 opacity-90 cursor-help border-b border-dotted border-amber-400" 
          title={SECURITY_DESCRIPTIONS.mixed}
        >
          Mixed
        </span>
      );
  }
}

function EdgeBadge({ address, type }: { address: string; type: ConversationType }) {
  // For webhooks, show "via Webhook" with full edge name on hover
  if (type === 'webhook') {
    // Extract webhook edge name from address if available
    const webhookName = address ? `Webhook: ${address}` : 'Webhook';
    return (
      <span 
        class="text-xs text-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)] px-1.5 py-0.5 rounded" 
        title={`Received via ${webhookName}`}
      >
        via Webhook
      </span>
    );
  }
  
  // For email addresses, show just the local part (before @)
  const displayAddress = address.includes('@') 
    ? address.split('@')[0] 
    : address;
  
  return (
    <span 
      class="text-xs text-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)] px-1.5 py-0.5 rounded" 
      title={`Received via ${address}`}
    >
      via {displayAddress}
    </span>
  );
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
  // Show edge badge for non-native conversations (email, discord, contact_endpoint, webhook)
  const showEdgeBadge = conversation.type !== 'native' && (conversation.edgeAddress || conversation.type === 'webhook');

  // Background color: selected > unread > default
  const bgClass = isSelected 
    ? 'bg-[var(--color-bg-active)]' 
    : isUnread 
      ? 'bg-[var(--color-unread-bg)] hover:bg-[var(--color-unread-bg-hover)]' 
      : 'hover:bg-[var(--color-bg-hover)]';

  return (
    <button 
      class={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors duration-150 ${bgClass}`}
      onClick={onClick}
    >
      <div class={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${
        isUnread ? 'bg-sky-500 text-[var(--color-text-inverse)]' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]'
      }`}>
        <div class="w-4 h-4">
          <OriginIcon type={conversation.type} />
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 mb-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)] whitespace-nowrap overflow-hidden text-ellipsis`}>
              {conversation.counterpartyName || 'Unknown'}
            </span>
            {showEdgeBadge && <EdgeBadge address={conversation.edgeAddress || ''} type={conversation.type} />}
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <SecurityBadge level={securityLevel} />
            <span class={`flex-shrink-0 text-xs ${isUnread ? 'text-[var(--color-text-secondary)] font-medium' : 'text-[var(--color-text-tertiary)]'}`}>
              {formatTime(conversation.lastActivityAt)}
            </span>
          </div>
        </div>
        {hasPreview && (
          <div class={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${
            isUnread ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'
          }`}>
            {conversation.lastMessagePreview}
          </div>
        )}
      </div>
    </button>
  );
}
