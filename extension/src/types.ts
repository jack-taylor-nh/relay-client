/**
 * Local type definitions for the extension
 * These mirror @relay/core types but are defined locally to avoid bundling issues
 */

export type ConversationType = 'native' | 'email' | 'contact_endpoint' | 'discord' | 'webhook';

export type SecurityLevel = 'e2ee' | 'gateway_secured' | 'mixed';

export interface Conversation {
  id: string;
  type: ConversationType;
  securityLevel: SecurityLevel;
  participants: string[];
  counterpartyName: string | null;
  lastMessagePreview?: string;
  lastActivityAt: string;
  createdAt: string;
  unreadCount?: number;
  isUnread?: boolean;  // True if lastActivityAt > lastSeenAt
  // Phase 4: Edge-to-edge messaging info
  myEdgeId?: string;              // My edge ID for this conversation
  counterpartyEdgeId?: string;    // Counterparty's edge ID
  counterpartyX25519PublicKey?: string; // Counterparty's encryption key
  edgeAddress?: string;           // The edge address this conversation came through (e.g., 'taylor@rlymsg.com')
}

export interface Identity {
  id: string;
  publicKey: string;
  homeServer: string;
  handle: string | null;
  createdAt: string;
}

export interface Edge {
  id: string;
  type: ConversationType;
  address: string;
  label: string | null;
  status: 'active' | 'disabled' | 'rotated';
  securityLevel: SecurityLevel;
  createdAt: string;
  messageCount: number;
}

// Legacy type - kept for backwards compatibility
export interface EmailAlias {
  id: string;
  address: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  messageCount: number;
}

// Handle utilities
export const HANDLE_PREFIX = '&';

export function formatHandle(handle: string): string {
  const clean = handle.toLowerCase().replace(/^&/, '');
  return `${HANDLE_PREFIX}${clean}`;
}
