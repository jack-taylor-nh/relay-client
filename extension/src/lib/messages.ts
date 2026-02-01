/**
 * Messages API Client
 * Platform-agnostic message operations
 */

// Note: This file is for future web/mobile apps.
// The extension uses background worker communication instead.

export interface Message {
  id: string;
  protocolVersion: string;
  conversationId: string;
  edgeId?: string;
  origin?: 'native' | 'email' | 'contact_link' | 'discord' | 'sms' | 'github' | 'slack' | 'other';
  securityLevel: 'e2ee' | 'gateway_secured';
  contentType: string;
  senderIdentityId?: string;
  senderExternalId?: string;
  
  // E2EE fields
  ciphertext?: string;
  ephemeralPubkey?: string;
  nonce?: string;
  signature?: string;
  
  // Gateway-secured fields
  plaintextContent?: string;
  
  createdAt: string;
}

export interface Conversation {
  id: string;
  origin: 'native' | 'email' | 'contact_link' | 'discord' | 'sms' | 'github' | 'slack' | 'other';
  edgeId?: string;
  securityLevel: 'e2ee' | 'gateway_secured' | 'mixed';
  channelLabel?: string;
  createdAt: string;
  lastActivityAt: string;
  
  // Additional metadata
  participants?: ConversationParticipant[];
  lastMessage?: Message;
  unreadCount?: number;
}

export interface ConversationParticipant {
  conversationId: string;
  identityId?: string;
  externalId?: string;
  displayName?: string;
  isOwner: boolean;
  joinedAt: string;
}

/**
 * Note: These functions are placeholders for future web/mobile apps.
 * The extension uses background worker communication instead.
 */

/*
export async function listConversations(authToken: string): Promise<Conversation[]> {
  const response = await apiRequest<{ conversations: Conversation[] }>('/v1/conversations', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  
  return response.conversations;
}

export async function getMessages(
  conversationId: string,
  authToken: string,
  limit = 50
): Promise<Message[]> {
  const response = await apiRequest<{ messages: Message[] }>(
    `/v1/conversations/${conversationId}/messages?limit=${limit}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    }
  );
  
  return response.messages;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  authToken: string
): Promise<Message> {
  const response = await apiRequest<{ message: Message }>(
    `/v1/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: {
        content,
        contentType: 'text/plain',
      },
    }
  );
  
  return response.message;
}
*/
