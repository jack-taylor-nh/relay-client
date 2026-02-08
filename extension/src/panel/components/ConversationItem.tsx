import type { Conversation, ConversationType, SecurityLevel } from '../../types';
import { MessageSquare, Mail, Webhook, Link, AtSign } from 'lucide-react';
import { SecurityBadge } from '@/components/relay/SecurityBadge';
import { ViaBadge } from '@/components/relay/ViaBadge';
import { cn } from '@/lib/utils';

interface Props {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

// Lucide icons for each conversation type
function OriginIcon({ type }: { type: ConversationType }) {
  const iconClass = "w-full h-full";
  
  switch (type) {
    case 'native':
      return <AtSign className={iconClass} />;
    case 'email':
      return <Mail className={iconClass} />;
    case 'discord':
      // Discord requires custom SVG (no lucide icon)
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      );
    case 'webhook':
      return <Webhook className={iconClass} />;
    case 'contact_endpoint':
      return <Link className={iconClass} />;
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
  
  // Show edge badge for all conversation types that have an edge address
  const edgeAddress = conversation.edgeAddress;
  const showEdgeBadge = !!edgeAddress || conversation.type === 'webhook';

  return (
    <button 
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors duration-150",
        isSelected 
          ? "bg-[hsl(var(--accent))]" 
          : isUnread 
            ? "bg-[hsl(var(--primary)/0.05)] hover:bg-[hsl(var(--primary)/0.1)]" 
            : "hover:bg-[hsl(var(--muted))]"
      )}
      onClick={onClick}
    >
      <div className={cn(
        "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full",
        isUnread 
          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" 
          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
      )}>
        <div className="w-4 h-4">
          <OriginIcon type={conversation.type} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              "text-sm text-[hsl(var(--foreground))] whitespace-nowrap overflow-hidden text-ellipsis",
              isUnread ? "font-semibold" : "font-medium"
            )}>
              {conversation.counterpartyName || 'Unknown'}
            </span>
            {showEdgeBadge && (
              <ViaBadge 
                address={edgeAddress || ''} 
                type={conversation.type}
                maxLength={10}
                className="text-[10px] px-1.5 py-0"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <SecurityBadge level={securityLevel} showLabel={false} size="sm" />
            <span className={cn(
              "flex-shrink-0 text-xs",
              isUnread 
                ? "text-[hsl(var(--foreground))] font-medium" 
                : "text-[hsl(var(--muted-foreground))]"
            )}>
              {formatTime(conversation.lastActivityAt)}
            </span>
          </div>
        </div>
        {hasPreview && (
          <div className={cn(
            "text-xs whitespace-nowrap overflow-hidden text-ellipsis",
            isUnread ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"
          )}>
            {conversation.lastMessagePreview}
          </div>
        )}
      </div>
    </button>
  );
}
