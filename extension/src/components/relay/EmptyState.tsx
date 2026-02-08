/**
 * EmptyState - Reusable empty state component
 * 
 * Used when there's no content to display (empty inbox, no edges, etc.)
 */

import { type ComponentChildren } from "preact";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon?: ComponentChildren;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "accent" | "outline";
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 mb-4 text-[hsl(var(--muted-foreground))] flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4 max-w-[280px]">
          {description}
        </p>
      )}
      {action && (
        <Button
          variant={action.variant === "accent" ? "accent" : action.variant === "outline" ? "outline" : "default"}
          onClick={action.onClick}
          size="sm"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
