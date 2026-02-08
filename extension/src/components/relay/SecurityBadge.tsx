/**
 * SecurityBadge - Standardized security level indicator
 * 
 * Single source of truth component for displaying security status.
 * Uses lucide icons only - NO emojis.
 * 
 * Security Levels:
 * - e2ee: End-to-end encrypted (Lock icon)
 * - gateway_secured: Gateway-secured relay (Repeat2/shuffle icon)
 * - mixed: Mixed security level (AlertTriangle icon)
 */

import { Lock, Repeat2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type SecurityLevel = "e2ee" | "gateway_secured" | "mixed";

export interface SecurityBadgeProps {
  level: SecurityLevel;
  variant?: "default" | "subtle" | "solid";
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const securityConfig: Record<
  SecurityLevel,
  {
    icon: typeof Lock;
    label: string;
    description: string;
    colorClass: string;
    bgClass: string;
  }
> = {
  e2ee: {
    icon: Lock,
    label: "End-to-end encrypted",
    description: "Messages are encrypted on your device and can only be read by you and the recipient.",
    colorClass: "text-[var(--color-success)]",
    bgClass: "bg-[var(--color-success-subtle)]",
  },
  gateway_secured: {
    icon: Repeat2,
    label: "Gateway-secured",
    description: "Messages are secured through the Relay gateway. Content is encrypted in transit.",
    colorClass: "text-[hsl(var(--accent))]",
    bgClass: "bg-[hsl(var(--accent))]/10",
  },
  mixed: {
    icon: AlertTriangle,
    label: "Mixed security",
    description: "This conversation includes messages with different security levels.",
    colorClass: "text-[var(--color-warning)]",
    bgClass: "bg-[var(--color-warning-subtle)]",
  },
};

export function SecurityBadge({
  level,
  variant = "default",
  showLabel = true,
  size = "md",
  className,
}: SecurityBadgeProps) {
  const config = securityConfig[level];
  const Icon = config.icon;
  
  const iconSize = size === "sm" ? 12 : 14;
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";
  const padding = variant === "subtle" ? "" : size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  
  const badge = (
    <div
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        gap,
        textSize,
        config.colorClass,
        variant === "solid" && config.bgClass,
        variant === "solid" && padding,
        variant === "default" && "border border-current/20",
        variant === "default" && padding,
        className
      )}
    >
      <Icon size={iconSize} className="flex-shrink-0" />
      {showLabel && <span>{config.label}</span>}
    </div>
  );

  // Wrap in tooltip if label is hidden or for additional context
  if (!showLabel || size === "sm") {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px]">
            <p className="font-medium">{config.label}</p>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
