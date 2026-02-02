/**
 * Relay API Client
 * 
 * Handles all HTTP communication with the Relay API server.
 * Authentication is done via signed nonces.
 */

// ============================================
// Types
// ============================================

export interface ApiError {
  message: string;
  code?: string;
}

export interface AuthSession {
  token: string;
  expiresAt: number;
}

export interface ResolvedHandle {
  handle: string;
  displayName: string | null;
  publicKey: string;
  createdAt: string;
}

export interface Handle {
  id: string;
  handle: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  type: 'native' | 'email' | 'contact_endpoint';
  participants: string[];
  counterpartyHandle?: string;
  counterpartyFingerprint?: string;
  lastMessagePreview?: string;
  lastActivityAt: string;
  createdAt: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  encryptedContent: string;
  nonce: string;
  createdAt: string;
}

export interface EmailAlias {
  id: string;
  address: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  messageCount: number;
}

// ============================================
// API Client Class
// ============================================

class ApiClient {
  private baseUrl: string = 'https://api.rlymsg.com';
  private session: AuthSession | null = null;

  // Signing function - will be set by background worker
  private signFn: ((message: string) => Promise<string>) | null = null;
  private fingerprint: string | null = null;
  private publicKey: string | null = null;

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  setAuth(fingerprint: string, publicKey: string, signFn: (message: string) => Promise<string>) {
    this.fingerprint = fingerprint;
    this.publicKey = publicKey;
    this.signFn = signFn;
  }

  clearAuth() {
    this.session = null;
    this.fingerprint = null;
    this.publicKey = null;
    this.signFn = null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
    authenticated = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add auth header if needed
    if (authenticated) {
      const token = await this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `API error: ${response.status}`);
    }

    return data as T;
  }

  private async getAuthToken(): Promise<string | null> {
    // Check if we have a valid session
    if (this.session && this.session.expiresAt > Date.now()) {
      return this.session.token;
    }

    // Need to authenticate
    if (!this.fingerprint || !this.publicKey || !this.signFn) {
      return null;
    }

    try {
      // Request nonce
      const { nonce } = await this.request<{ nonce: string }>(
        'POST',
        '/v1/auth/nonce',
        { identityId: this.fingerprint }
      );

      // Sign the nonce
      const signature = await this.signFn(`relay-auth:${nonce}`);

      // Verify and get token
      const { token, expiresAt } = await this.request<{ token: string; expiresAt: number }>(
        'POST',
        '/v1/auth/verify',
        {
          publicKey: this.publicKey,
          nonce,
          signature,
        }
      );

      this.session = { token, expiresAt };
      return token;
    } catch (error) {
      console.error('Auth failed:', error);
      return null;
    }
  }

  // ============================================
  // Handle Operations
  // ============================================

  async createHandle(handle: string, displayName?: string): Promise<Handle> {
    return this.request<Handle>(
      'POST',
      '/v1/handles',
      { handle, displayName },
      true
    );
  }

  async getHandles(): Promise<{ handles: Handle[] }> {
    return this.request<{ handles: Handle[] }>('GET', '/v1/handles', undefined, true);
  }

  async resolveHandle(handle: string): Promise<ResolvedHandle | null> {
    try {
      const cleanHandle = handle.toLowerCase().replace(/^@/, '');
      return await this.request<ResolvedHandle>('GET', `/v1/handles/${cleanHandle}`);
    } catch {
      return null;
    }
  }

  // Legacy handle claim (deprecated - use createHandle)
  async claimHandle(
    handle: string,
    publicKey: string,
    nonce: string,
    signature: string
  ): Promise<{ success: boolean; handle?: string; error?: string }> {
    try {
      const result = await this.request<{ handle: string }>(
        'POST',
        '/v1/handle/claim',
        { handle, publicKey, nonce, signature }
      );
      return { success: true, handle: result.handle };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================
  // Conversation Operations
  // ============================================

  async getConversations(): Promise<ConversationSummary[]> {
    return this.request<ConversationSummary[]>('GET', '/v1/conversations', undefined, true);
  }

  async getConversation(id: string): Promise<ConversationSummary> {
    return this.request<ConversationSummary>('GET', `/v1/conversations/${id}`, undefined, true);
  }

  async getMessages(conversationId: string, limit = 50, before?: string): Promise<Message[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    
    return this.request<Message[]>(
      'GET',
      `/v1/conversations/${conversationId}/messages?${params}`,
      undefined,
      true
    );
  }

  async sendMessage(
    conversationId: string,
    encryptedContent: string,
    nonce: string,
    recipientFingerprint: string
  ): Promise<Message> {
    return this.request<Message>(
      'POST',
      `/v1/conversations/${conversationId}/messages`,
      { encryptedContent, nonce, recipientFingerprint },
      true
    );
  }

  async startConversation(
    recipientFingerprint: string,
    encryptedContent: string,
    nonce: string
  ): Promise<{ conversationId: string; messageId: string }> {
    return this.request<{ conversationId: string; messageId: string }>(
      'POST',
      '/v1/conversations',
      { recipientFingerprint, encryptedContent, nonce },
      true
    );
  }

  // ============================================
  // Native Messaging
  // ============================================

  async sendNativeMessage(
    recipientHandle: string,
    senderHandle: string,
    ciphertext: string,
    ephemeralPubkey: string,
    nonce: string,
    signature: string,
    contentType = 'text/plain'
  ): Promise<{ 
    messageId: string;
    conversationId: string;
    recipientPublicKey: string;
    createdAt: string;
  }> {
    return this.request(
      'POST',
      '/v1/messages/send-native',
      {
        recipientHandle,
        senderHandle,
        ciphertext,
        ephemeralPubkey,
        nonce,
        signature,
        contentType,
      },
      true
    );
  }

  // ============================================
  // Email Alias Operations
  // ============================================

  async getAliases(): Promise<EmailAlias[]> {
    return this.request<EmailAlias[]>('GET', '/v1/aliases', undefined, true);
  }

  async createAlias(label?: string): Promise<EmailAlias> {
    return this.request<EmailAlias>('POST', '/v1/aliases', { label }, true);
  }

  async updateAlias(id: string, updates: { label?: string; isActive?: boolean }): Promise<EmailAlias> {
    return this.request<EmailAlias>('PATCH', `/v1/aliases/${id}`, updates, true);
  }

  async deleteAlias(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/aliases/${id}`, undefined, true);
  }
}

// Singleton instance
export const api = new ApiClient();
