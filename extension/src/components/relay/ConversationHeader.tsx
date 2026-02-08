/**
 * ConversationHeader - Header shown at the top of a conversation
 * 
 * Always displays:
 * - Counterparty name/label
 * - SecurityBadge (icon + text)
 * - Optional edge/address info
 */

import { type ComponentChildren } from "preact";
import { ArrowLeft, MoreVertical, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SecurityBadge, type SecurityLevel } from "./SecurityBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ConversationHeaderProps {
  counterpartyName: string;
  counterpartyAddress?: string;
  securityLevel: SecurityLevel;
  onBack?: () => void;
  onInfoClick?: () => void;
  actions?: ComponentChildren;
  className?: string;
}

export function ConversationHeader({
  counterpartyName,
  counterpartyAddress,
  securityLevel,
  onBack,
  onInfoClick,
  actions,
  className,
}: ConversationHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="flex-shrink-0 -ml-1 h-8 w-8"
            title="Back to inbox"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
              {counterpartyName}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 mt-0.5">
            <SecurityBadge 
              level={securityLevel} 
              variant="subtle" 
              size="sm"
              showLabel={true}
            />
            {counterpartyAddress && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] truncate max-w-[120px] cursor-help">
                      {counterpartyAddress}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{counterpartyAddress}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {onInfoClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onInfoClick}
            className="h-8 w-8"
            title="Conversation info"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}
        {actions}
      </div>
    </header>
  );
}
