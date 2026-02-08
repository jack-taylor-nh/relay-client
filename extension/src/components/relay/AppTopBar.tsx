/**
 * AppTopBar - Standard app header/navigation bar
 * 
 * Used at the top of views with title, optional back button, and actions.
 */

import { type ComponentChildren } from "preact";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface AppTopBarProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ComponentChildren;
  children?: ComponentChildren;
  className?: string;
  sticky?: boolean;
}

export function AppTopBar({
  title,
  subtitle,
  onBack,
  backLabel,
  actions,
  children,
  className,
  sticky = false,
}: AppTopBarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] min-h-[56px]",
        sticky && "sticky top-0 z-10",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="flex-shrink-0 -ml-2"
            title={backLabel || "Go back"}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {children ? (
          children
        ) : (
          <div className="min-w-0 flex-1">
            {title && (
              <h1 className="text-base font-semibold text-[hsl(var(--foreground))] truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {actions}
        </div>
      )}
    </header>
  );
}
