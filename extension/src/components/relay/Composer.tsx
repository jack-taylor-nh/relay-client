/**
 * Composer - Message input field for conversations
 * 
 * Features:
 * - Auto-growing textarea
 * - Send button with keyboard shortcut (Enter)
 * - Disabled states
 * - Optional security indicator
 */

import { useState, useRef, useEffect } from "preact/hooks";
import { Send, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type SecurityLevel } from "./SecurityBadge";

export interface ComposerProps {
  onSend: (message: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  securityLevel?: SecurityLevel;
  showSecurityIndicator?: boolean;
  maxLength?: number;
  className?: string;
}

export function Composer({
  onSend,
  placeholder = "Type a message...",
  disabled = false,
  loading = false,
  securityLevel,
  showSecurityIndicator = false,
  maxLength = 10000,
  className,
}: ComposerProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled || loading) return;

    try {
      await onSend(trimmedMessage);
      setMessage("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      // Error handling is delegated to parent
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !loading;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        className
      )}
    >
      {showSecurityIndicator && securityLevel === "e2ee" && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
          <Lock size={10} />
          <span>End-to-end encrypted</span>
        </div>
      )}
      
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || loading}
            maxLength={maxLength}
            rows={1}
            className={cn(
              "w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "min-h-[42px] max-h-[120px]"
            )}
          />
        </div>
        
        <Button
          onClick={handleSend}
          disabled={!canSend}
          loading={loading}
          variant="accent"
          size="icon"
          className="h-[42px] w-[42px] rounded-xl flex-shrink-0"
          title="Send message"
        >
          {!loading && <Send className="h-4 w-4" />}
        </Button>
      </div>
      
      {message.length > maxLength * 0.9 && (
        <div className="text-[10px] text-[hsl(var(--muted-foreground))] text-right">
          {message.length} / {maxLength}
        </div>
      )}
    </div>
  );
}
