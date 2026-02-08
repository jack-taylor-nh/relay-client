/**
 * MessageRow - Individual message in a conversation
 * 
 * Handles both sent and received messages with proper styling and layout.
 */

import { type ComponentChildren } from "preact";
import { cn } from "@/lib/utils";

export interface MessageRowProps {
  content: string | ComponentChildren;
  timestamp: string;
  isMine: boolean;
  senderName?: string;
  showSender?: boolean;
  status?: "sending" | "sent" | "delivered" | "read" | "error";
  className?: string;
}

export function MessageRow({
  content,
  timestamp,
  isMine,
  senderName,
  showSender = false,
  status,
  className,
}: MessageRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col px-3 py-1",
        isMine ? "items-end" : "items-start",
        className
      )}
    >
      {showSender && senderName && !isMine && (
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5 px-3">
          {senderName}
        </span>
      )}
      
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          isMine
            ? "bg-[hsl(var(--accent))] text-white rounded-br-md"
            : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-bl-md"
        )}
      >
        {typeof content === "string" ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          content
        )}
      </div>
      
      <div
        className={cn(
          "flex items-center gap-1.5 mt-0.5 px-1",
          isMine ? "flex-row-reverse" : "flex-row"
        )}
      >
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          {timestamp}
        </span>
        {isMine && status && (
          <MessageStatus status={status} />
        )}
      </div>
    </div>
  );
}

function MessageStatus({ status }: { status: string }) {
  const getStatusIndicator = () => {
    switch (status) {
      case "sending":
        return (
          <svg className="w-3 h-3 text-[hsl(var(--muted-foreground))] animate-pulse" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="3" />
          </svg>
        );
      case "sent":
        return (
          <svg className="w-3 h-3 text-[hsl(var(--muted-foreground))]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 8l4 4 8-8" />
          </svg>
        );
      case "delivered":
        return (
          <svg className="w-3 h-3 text-[hsl(var(--muted-foreground))]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 8l3 3 5-5" />
            <path d="M6 8l3 3 5-5" />
          </svg>
        );
      case "read":
        return (
          <svg className="w-3 h-3 text-[hsl(var(--accent))]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 8l3 3 5-5" />
            <path d="M6 8l3 3 5-5" />
          </svg>
        );
      case "error":
        return (
          <svg className="w-3 h-3 text-[hsl(var(--destructive))]" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4v5M8 11v1" strokeWidth="1.5" stroke="currentColor" />
          </svg>
        );
      default:
        return null;
    }
  };

  return <span className="flex-shrink-0">{getStatusIndicator()}</span>;
}

/**
 * MessageGroup - Groups messages from the same sender
 */
export interface MessageGroupProps {
  children: ComponentChildren;
  className?: string;
}

export function MessageGroup({ children, className }: MessageGroupProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      {children}
    </div>
  );
}

/**
 * DateSeparator - Shows date dividers in message list
 */
export interface DateSeparatorProps {
  date: string;
  className?: string;
}

export function DateSeparator({ date, className }: DateSeparatorProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center py-3",
        className
      )}
    >
      <span className="px-3 py-1 text-[10px] font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] rounded-full">
        {date}
      </span>
    </div>
  );
}
