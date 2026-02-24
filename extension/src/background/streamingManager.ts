/**
 * Streaming Manager
 * 
 * Manages streaming chunk reassembly for Local LLM responses.
 * Tracks chunks by conversation ID, handles out-of-order delivery,
 * and provides progressive message updates.
 */

export interface ChunkMetadata {
  type: 'streaming-chunk';
  seq: number;
  isFinal: boolean;
}

export interface StreamingState {
  conversationId: string;
  edgeId: string;
  chunks: Map<number, string>; // seq -> content
  nextExpectedSeq: number;
  displayedContent: string;
  isComplete: boolean;
  lastChunkTime: number;
}

class StreamingManager {
  private activeStreams: Map<string, StreamingState> = new Map();
  private readonly CHUNK_TIMEOUT_MS = 30000; // 30 seconds
  
  /**
   * Parse chunk metadata from message content
   * Returns { metadata, content } or null if not a streaming chunk
   */
  parseChunkMetadata(content: string): { metadata: ChunkMetadata; content: string } | null {
    const metadataPrefix = '__RELAY_CHUNK_METADATA__:';
    
    if (!content.startsWith(metadataPrefix)) {
      return null; // Not a streaming chunk
    }
    
    try {
      const metadataEndIndex = content.indexOf('\n');
      if (metadataEndIndex === -1) {
        console.error('[StreamingManager] Invalid chunk metadata format');
        return null;
      }
      
      const metadataJson = content.substring(metadataPrefix.length, metadataEndIndex);
      const metadata = JSON.parse(metadataJson) as ChunkMetadata;
      const chunkContent = content.substring(metadataEndIndex + 1);
      
      return { metadata, content: chunkContent };
    } catch (error) {
      console.error('[StreamingManager] Failed to parse chunk metadata:', error);
      return null;
    }
  }

  /**
   * Get or create streaming state for a conversation
   */
  private getOrCreateState(conversationId: string, edgeId: string): StreamingState {
    const key = `${conversationId}:${edgeId}`;
    
    if (!this.activeStreams.has(key)) {
      this.activeStreams.set(key, {
        conversationId,
        edgeId,
        chunks: new Map(),
        nextExpectedSeq: 0,
        displayedContent: '',
        isComplete: false,
        lastChunkTime: Date.now(),
      });
      
      console.log('[StreamingManager] Created new streaming state:', { conversationId, edgeId });
    }
    
    return this.activeStreams.get(key)!;
  }

  /**
   * Process an incoming chunk
   * Returns updated display content if changed, null otherwise
   */
  processChunk(
    conversationId: string,
    edgeId: string,
    metadata: ChunkMetadata,
    content: string
  ): { displayContent: string; isComplete: boolean } | null {
    const state = this.getOrCreateState(conversationId, edgeId);
    
    console.log('[StreamingManager] Processing chunk:', {
      conversationId,
      seq: metadata.seq,
      isFinal: metadata.isFinal,
      contentLength: content.length,
      nextExpectedSeq: state.nextExpectedSeq,
    });
    
    // Store chunk
    state.chunks.set(metadata.seq, content);
    state.lastChunkTime = Date.now();
    
    // Check if we can append chunks to display
    let updated = false;
    while (state.chunks.has(state.nextExpectedSeq)) {
      const chunkContent = state.chunks.get(state.nextExpectedSeq)!;
      state.displayedContent += chunkContent;
      state.chunks.delete(state.nextExpectedSeq);
      state.nextExpectedSeq++;
      updated = true;
    }
    
    // Check if stream is complete
    if (metadata.isFinal && state.nextExpectedSeq > metadata.seq) {
      state.isComplete = true;
      console.log('[StreamingManager] Stream complete:', {
        conversationId,
        totalLength: state.displayedContent.length,
      });
    }
    
    if (updated) {
      return {
        displayContent: state.displayedContent,
        isComplete: state.isComplete,
      };
    }
    
    return null; // No update to display yet (waiting for earlier chunks)
  }

  /**
   * Get current display content for a streaming message
   */
  getDisplayContent(conversationId: string, edgeId: string): string | null {
    const key = `${conversationId}:${edgeId}`;
    const state = this.activeStreams.get(key);
    return state ? state.displayedContent : null;
  }

  /**
   * Check if a stream is complete
   */
  isStreamComplete(conversationId: string, edgeId: string): boolean {
    const key = `${conversationId}:${edgeId}`;
    const state = this.activeStreams.get(key);
    return state?.isComplete ?? true; // Consider non-existent streams as complete
  }

  /**
   * Check if there are any active streams
   */
  hasActiveStreams(): boolean {
    for (const state of this.activeStreams.values()) {
      if (!state.isComplete) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear streaming state (call when stream is complete)
   */
  clearStream(conversationId: string, edgeId: string): void {
    const key = `${conversationId}:${edgeId}`;
    this.activeStreams.delete(key);
    console.log('[StreamingManager] Cleared streaming state:', { conversationId, edgeId });
  }

  /**
   * Cleanup stale streams (haven't received chunks in a while)
   */
  cleanupStaleStreams(): void {
    const now = Date.now();
    const staleKeys: string[] = [];
    
    for (const [key, state] of this.activeStreams.entries()) {
      if (now - state.lastChunkTime > this.CHUNK_TIMEOUT_MS) {
        console.warn('[StreamingManager] Cleaning up stale stream:', {
          conversationId: state.conversationId,
          edgeId: state.edgeId,
          age: now - state.lastChunkTime,
        });
        staleKeys.push(key);
      }
    }
    
    staleKeys.forEach(key => this.activeStreams.delete(key));
  }

  /**
   * Get all active stream states (for debugging)
   */
  getActiveStreamStates(): StreamingState[] {
    return Array.from(this.activeStreams.values());
  }
}

// Export singleton instance
export const streamingManager = new StreamingManager();
