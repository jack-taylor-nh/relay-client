/**
 * Storage implementation for browser extension
 * Provides persistent storage for ratchet states using chrome.storage.local
 */

import type { RatchetStorage } from '@relay/core';

/**
 * Chrome Storage-based implementation of RatchetStorage
 * Stores ratchet states in chrome.storage.local for persistence
 */
export class ChromeRatchetStorage implements RatchetStorage {
  async load(conversationId: string): Promise<string | null> {
    const key = `ratchet:${conversationId}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  }

  async save(conversationId: string, serializedState: string): Promise<void> {
    const key = `ratchet:${conversationId}`;
    await chrome.storage.local.set({ [key]: serializedState });
  }
}

/**
 * Singleton instance for use throughout the extension
 */
export const ratchetStorage = new ChromeRatchetStorage();
