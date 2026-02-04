/**
 * API client for Contact Link frontend
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.rlymsg.com/v1';

interface LinkInfo {
  linkId: string;
  edgeId: string;
  x25519PublicKey: string;
  createdAt: string;
}

interface SessionResponse {
  sessionId: string;
  conversationId: string | null;
  encryptedRatchetState: string | null;
  encryptedMessageHistory: string | null;
  displayName: string | null;
  isNew: boolean;
}

interface Message {
  id: string;
  encryptedContent: string; // Base64-encoded encrypted message envelope
  ciphertext: string;
  ephemeralPubkey: string;
  nonce: string;
  pn: number | null;
  n: number | null;
  createdAt: string;
}

interface MessagesResponse {
  messages: Message[];
  conversationId: string;
}

interface SendMessageResponse {
  messageId: string;
  conversationId: string;
  createdAt: string;
}

export class LinkApiClient {
  private linkId: string;
  public baseUrl: string;
  
  constructor(linkId: string) {
    this.linkId = linkId;
    this.baseUrl = API_BASE;
  }
  
  /**
   * Get contact link info (public key for encryption)
   */
  async getLinkInfo(): Promise<LinkInfo> {
    const res = await fetch(`${API_BASE}/link/${this.linkId}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to fetch link info');
    }
    return res.json();
  }
  
  /**
   * Create or restore a session
   */
  async createSession(visitorPublicKey: string, displayName?: string): Promise<SessionResponse> {
    const res = await fetch(`${API_BASE}/link/${this.linkId}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorPublicKey, displayName }),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      if (res.status === 429) {
        throw new Error(`Rate limited. ${error.message}`);
      }
      throw new Error(error.message || 'Failed to create session');
    }
    
    return res.json();
  }
  
  /**
   * Get existing session
   */
  async getSession(visitorPublicKey: string): Promise<SessionResponse | null> {
    const res = await fetch(`${API_BASE}/link/${this.linkId}/session/${encodeURIComponent(visitorPublicKey)}`);
    
    if (res.status === 404) {
      return null;
    }
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to fetch session');
    }
    
    return res.json();
  }
  
  /**
   * Update encrypted ratchet state and message history
   */
  async updateRatchetState(
    visitorPublicKey: string, 
    encryptedRatchetState: string,
    encryptedMessageHistory?: string
  ): Promise<void> {
    const res = await fetch(
      `${API_BASE}/link/${this.linkId}/session/${encodeURIComponent(visitorPublicKey)}/ratchet`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedRatchetState, encryptedMessageHistory }),
      }
    );
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to update ratchet state');
    }
  }
  
  /**
   * Send a message
   */
  async sendMessage(
    visitorPublicKey: string,
    payload: {
      ciphertext: string;
      ephemeralPubkey: string;
      nonce: string;
      pn?: number;
      n?: number;
    },
    encryptedRatchetState?: string
  ): Promise<SendMessageResponse> {
    const res = await fetch(`${API_BASE}/link/${this.linkId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorPublicKey,
        payload,
        encryptedRatchetState,
      }),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to send message');
    }
    
    return res.json();
  }
  
  /**
   * Poll for new messages
   */
  async getMessages(visitorPublicKey: string, since?: string): Promise<MessagesResponse> {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    
    const url = `${API_BASE}/link/${this.linkId}/messages/${encodeURIComponent(visitorPublicKey)}?${params}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to fetch messages');
    }
    
    return res.json();
  }
}
