/**
 * Secure Logging Utility
 * 
 * 🔒 SECURITY POLICY:
 * - NEVER log plaintext message content
 * - NEVER log plaintext LLM responses
 * - Only log metadata (lengths, IDs, timestamps)
 * - Sanitize error objects before logging
 * 
 * This utility provides helpers to ensure sensitive data doesn't leak into logs.
 */

/**
 * Estimate token count (rough approximation)
 * Used for logging without exposing actual content
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English text  
  return Math.ceil(text.length / 4);
}

/**
 * Sanitize message for logging
 * Returns safe metadata without exposing actual content
 */
export function sanitizeMessage(content: string): {
  length: number;
  estimatedTokens: number;
  preview: string; // Only first/last few chars
} {
  return {
    length: content.length,
    estimatedTokens: estimateTokens(content),
    preview: content.length > 20 
      ? `${content.slice(0, 8)}...${content.slice(-8)}`
      : '[too short to preview]',
  };
}

/**
 * Sanitize error object for logging
 * Removes any message content while preserving stack trace
 */
export function sanitizeError(error: unknown): {
  message: string;
  stack?: string;
  code?: string;
  type: string;
} {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    };
  }
  
  return {
    type: 'Unknown',
    message: String(error),
  };
}

/**
 * Sanitize API response for logging
 * Removes sensitive headers and body content
 */
export function sanitizeResponse(response: {
  status: number;
  statusText: string;
  headers?: Headers;
}): {
  status: number;
  statusText: string;
  contentType?: string;
} {
  return {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers?.get('content-type') || undefined,
  };
}

/**
 * Sanitize conversation context for logging
 * Shows message count and structure without content
 */
export function sanitizeConversation(messages: Array<{
  role: string;
  content: string;
  timestamp?: string;
}>): {
  messageCount: number;
  totalTokens: number;
  roles: string[];
  timestamps?: string[];
} {
  return {
    messageCount: messages.length,
    totalTokens: messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0),
    roles: messages.map(msg => msg.role),
    timestamps: messages.map(msg => msg.timestamp).filter(Boolean) as string[],
  };
}

/**
 * Create safe log context for bridge operations
 */
export function createSafeLogContext(params: {
  conversationId?: string;
  messageId?: string;
  edgeId?: string;
  model?: string;
  contentLength?: number;
  latencyMs?: number;
}) {
  // Filter out undefined values
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined)
  );
}

/**
 * Redact sensitive values from objects
 * Use for logging configuration or metadata that might contain keys
 */
export function redactSensitive<T extends Record<string, any>>(
  obj: T,
  sensitiveKeys: string[] = ['authToken', 'privateKey', 'secretKey', 'apiKey', 'password']
): Record<string, any> {
  const result: Record<string, any> = { ...obj };
  
  for (const key of sensitiveKeys) {
    if (key in result) {
      result[key] = '[REDACTED]';
    }
  }
  
  return result;
}
