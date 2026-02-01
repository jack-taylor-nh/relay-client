/**
 * Edge Management API Client
 * Platform-agnostic edge operations
 */

// Note: This file is for future web/mobile apps.
// The extension uses background worker communication instead.

export interface Edge {
  id: string;
  identityId: string;
  type: 'native' | 'email' | 'contact_link' | 'discord' | 'sms' | 'github' | 'slack' | 'other';
  address: string;
  label?: string;
  status: 'active' | 'disabled' | 'rotated';
  securityLevel: 'e2ee' | 'gateway_secured';
  createdAt: string;
  disabledAt?: string;
  rotatedFromEdgeId?: string;
  policy?: EdgePolicy;
  messageCount: number;
  lastActivityAt?: string;
}

export interface EdgePolicy {
  rateLimit?: number;
  firstContact?: {
    mode: 'open' | 'pow' | 'allowlist' | 'mutual';
    powDifficulty?: number;
    allowlist?: string[];
  };
  denylist?: string[];
}

export interface CreateEdgeRequest {
  type: Edge['type'];
  label?: string;
  policy?: EdgePolicy;
}

export interface CreateEdgeResponse {
  edge: Edge;
}

/**
 * Note: These functions are placeholders for future web/mobile apps.
 * The extension uses background worker communication instead.
 */

/*
export async function createEdge(
  params: CreateEdgeRequest,
  authToken: string
): Promise<Edge> {
  const response = await apiRequest<CreateEdgeResponse>('/v1/edges', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
    body: params,
  });
  
  return response.edge;
}

export async function listEdges(authToken: string): Promise<Edge[]> {
  const response = await apiRequest<{ edges: Edge[] }>('/v1/edges', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  
  return response.edges;
}

export async function disableEdge(
  edgeId: string,
  authToken: string
): Promise<void> {
  await apiRequest(`/v1/edges/${edgeId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
}

export async function rotateEdge(
  edgeId: string,
  authToken: string
): Promise<Edge> {
  const response = await apiRequest<{ newEdge: Edge }>(`/v1/edges/${edgeId}/rotate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  
  return response.newEdge;
}
*/

/**
 * Generate a random email alias address (client-side)
 */
export function generateEmailAlias(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let alias = '';
  for (let i = 0; i < 12; i++) {
    alias += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${alias}@rlymsg.com`;
}
