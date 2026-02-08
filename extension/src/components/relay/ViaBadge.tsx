/**
 * ViaBadge - Badge showing which edge a conversation was received via
 * 
 * Supports all conversation types with truncation and tooltip for full address.
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConversationType } from "../../types";

export interface ViaBadgeProps {
  address: string;
  type: ConversationType;
  maxLength?: number;
  className?: string;
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string, maxLength: number): string {
  if (address.length <= maxLength) return address;
  return address.slice(0, maxLength) + '…';
}

/**
 * Format the display address based on type
 */
function formatDisplayAddress(address: string, type: ConversationType, maxLength: number): string {
  // For webhooks, show "Webhook" with ID
  if (type === 'webhook') {
    return 'Webhook';
  }
  
  // For email addresses, show just the local part (before @)
  if (address.includes('@')) {
    const localPart = address.split('@')[0];
    return truncateAddress(localPart, maxLength);
  }
  
  // For native handles, ensure & prefix and truncate
  if (type === 'native' || type === 'discord') {
    const cleanHandle = address.startsWith('&') ? address.slice(1) : address;
    return '&' + truncateAddress(cleanHandle, maxLength - 1); // -1 for the &
  }
  
  // For contact links, show just the code
  if (type === 'contact_endpoint') {
    return truncateAddress(address, maxLength);
  }
  
  return truncateAddress(address, maxLength);
}

/**
 * Format the full address for tooltip
 */
function formatFullAddress(address: string, type: ConversationType): string {
  if (type === 'webhook') {
    return `Received via Webhook: ${address || 'Unknown'}`;
  }
  
  if (type === 'native' || type === 'discord') {
    const cleanHandle = address.startsWith('&') ? address : `&${address}`;
    return `Received via ${cleanHandle}`;
  }
  
  return `Received via ${address}`;
}

export function ViaBadge({ 
  address, 
  type, 
  maxLength = 12,
  className 
}: ViaBadgeProps) {
  const displayAddress = formatDisplayAddress(address, type, maxLength);
  const fullAddress = formatFullAddress(address, type);
  const needsTooltip = address.length > maxLength || type === 'webhook';
  
  const badge = (
    <Badge variant="secondary" className={className}>
      via {displayAddress}
    </Badge>
  );
  
  if (!needsTooltip) {
    return badge;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{fullAddress}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
