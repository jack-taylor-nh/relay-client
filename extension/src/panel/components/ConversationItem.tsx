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
        <span class="security-badge e2ee" title="End-to-end encrypted">
          🔒
        </span>
      );
    case 'gateway_secured':
      return (
        <span class="security-badge gateway" title="Relayed (gateway secured)">
          🔁
        </span>
      );
    case 'mixed':
      return (
        <span class="security-badge mixed" title="Mixed security levels">
          ⚠️
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
  const hasUnread = (conversation.unreadCount ?? 0) > 0;
  const securityLevel = conversation.securityLevel || 'e2ee';

  return (
    <button class={`conversation-item ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <div class="conversation-icon">
        <OriginIcon type={conversation.type} />
      </div>
      <div class="conversation-content">
        <div class="conversation-header">
          <span class={`conversation-name ${hasUnread ? 'unread' : ''}`}>
            {conversation.counterpartyName || 'Unknown'}
          </span>
          <div class="conversation-meta">
            <SecurityBadge level={securityLevel} />
            <span class="conversation-time">{formatTime(conversation.lastActivityAt)}</span>
          </div>
        </div>
        <div class="conversation-preview">
          {conversation.lastMessagePreview || 'No messages yet'}
        </div>
      </div>
      {hasUnread && <div class="unread-dot" />}
      <style>{`
        .conversation-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: var(--space-3) var(--space-4);
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background-color var(--transition-fast);
        }
        
        .conversation-item:hover {
          background-color: var(--color-bg-hover);
        }
        
        .conversation-item.selected {
          background-color: var(--color-bg-active);
        }
        
        .conversation-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--color-bg-hover);
          border-radius: var(--radius-full);
          color: var(--color-text-secondary);
        }
        
        .conversation-icon svg {
          width: 18px;
          height: 18px;
        }
        
        .conversation-content {
          flex: 1;
          min-width: 0;
        }
        
        .conversation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          margin-bottom: var(--space-1);
        }
        
        .conversation-meta {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          flex-shrink: 0;
        }
        
        .security-badge {
          font-size: 12px;
          line-height: 1;
          cursor: help;
        }
        
        .security-badge.e2ee {
          opacity: 0.7;
        }
        
        .security-badge.gateway {
          opacity: 0.7;
        }
        
        .security-badge.mixed {
          opacity: 0.9;
        }
        
        .conversation-name {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .conversation-name.unread {
          font-weight: 600;
        }
        
        .conversation-time {
          flex-shrink: 0;
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }
        
        .conversation-preview {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .unread-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          background-color: var(--color-accent);
          border-radius: var(--radius-full);
        }
      `}</style>
    </button>
  );
}
