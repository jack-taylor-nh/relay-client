/**
 * EdgeCard - Card component for displaying edge information
 * 
 * Supports all edge types with appropriate styling and icons.
 */

import { type ComponentChildren } from "preact";
import { 
  Hash, 
  Mail, 
  MessageSquare, 
  Webhook, 
  Link2, 
  Shield,
  MoreVertical,
  Copy,
  Trash2,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type EdgeType = "native" | "email" | "discord" | "webhook" | "contact_link";

export interface EdgeCardProps {
  id: string;
  type: EdgeType;
  address: string;
  label?: string;
  displayName?: string;
  isActive?: boolean;
  createdAt?: string;
  onCopy?: (address: string) => void;
  onManage?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

const edgeConfig: Record<
  EdgeType,
  {
    icon: typeof Hash;
    label: string;
    badgeVariant: "native" | "email" | "discord" | "webhook" | "contact-link";
    colorClass: string;
  }
> = {
  native: {
    icon: Hash,
    label: "Native Handle",
    badgeVariant: "native",
    colorClass: "text-[var(--color-edge-native)]",
  },
  email: {
    icon: Mail,
    label: "Email Alias",
    badgeVariant: "email",
    colorClass: "text-[var(--color-edge-email)]",
  },
  discord: {
    icon: MessageSquare,
    label: "Discord",
    badgeVariant: "discord",
    colorClass: "text-[var(--color-edge-discord)]",
  },
  webhook: {
    icon: Webhook,
    label: "Webhook",
    badgeVariant: "webhook",
    colorClass: "text-[var(--color-edge-webhook)]",
  },
  contact_link: {
    icon: Link2,
    label: "Contact Link",
    badgeVariant: "contact-link",
    colorClass: "text-[var(--color-edge-contact-link)]",
  },
};

export function EdgeCard({
  id,
  type,
  address,
  label,
  displayName,
  isActive = true,
  createdAt,
  onCopy,
  onManage,
  onDelete,
  className,
}: EdgeCardProps) {
  const config = edgeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--border))]/80 transition-colors",
        !isActive && "opacity-60",
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0",
          `bg-[var(--color-edge-${type === "contact_link" ? "contact-link" : type}-subtle)]`
        )}
      >
        <Icon className={cn("h-5 w-5", config.colorClass)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
            {displayName || label || address}
          </span>
          <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
            {config.label}
          </Badge>
        </div>
        
        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono truncate">
          {address}
        </p>
        
        {createdAt && (
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
            Created {createdAt}
          </p>
        )}
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onCopy && (
            <DropdownMenuItem onClick={() => onCopy(address)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy address
            </DropdownMenuItem>
          )}
          {onManage && (
            <DropdownMenuItem onClick={() => onManage(id)}>
              <Settings className="h-4 w-4 mr-2" />
              Manage
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(id)}
                className="text-[hsl(var(--destructive))]"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * EdgeList - Container for EdgeCards
 */
export interface EdgeListProps {
  children: ComponentChildren;
  className?: string;
}

export function EdgeList({ children, className }: EdgeListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {children}
    </div>
  );
}
