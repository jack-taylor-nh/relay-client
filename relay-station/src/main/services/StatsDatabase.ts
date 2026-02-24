/**
 * Stats Database Service
 * 
 * 🔒 SECURITY GUARANTEE:
 * - NO plaintext message content stored
 * - NO LLM prompts stored
 * - NO conversation history stored
 * - Only aggregated metadata and statistics
 * 
 * Storage: SQLite database at ~/.relay-station/stats.db
 * Retention: Detailed events for 7 days, aggregated stats forever
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { ulid } from 'ulid';

// Types
export interface BridgeConfig {
  id: string;
  name: string;
  description: string | null;
  modelDefault: string;
  modelAllowed: string[]; // JSON array
  systemPrompt: string;
  rateLimitConfig: RateLimitConfig;
  accessControlConfig: AccessControlConfig;
  status: 'active' | 'paused' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowSeconds: number;
  perUser: boolean;
  tokenLimit?: number;
}

export interface AccessControlConfig {
  mode: 'public' | 'whitelist' | 'private';
  whitelist?: string[];
  requiresAuth: boolean;
}

export interface UsageEvent {
  id: string;
  bridgeId: string;
  userFingerprint: string | null;
  userHandle: string | null;
  conversationId: string;
  messageId: string;
  timestamp: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  errorCode: string | null;
  metadata: Record<string, any> | null;
}

export interface DailyStat {
  id: string;
  bridgeId: string;
  date: string; // YYYY-MM-DD
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgLatencyMs: number;
  errorCount: number;
  uniqueUsers: number;
  topModel: string;
}

export interface SessionStat {
  sessionId: string;
  bridgeId: string;
  startedAt: number;
  endedAt: number | null;
  requests: number;
  tokens: number;
}

class StatsDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;
  private currentSessionId: string | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'stats.db');
  }

  /**
   * Initialize database and create schema
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.ensureDir(path.dirname(this.dbPath));

    // Open database
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    
    console.log('[StatsDB] Opened database at:', this.dbPath);

    // Run migrations
    await this.runMigrations();
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create version tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const currentVersion = this.db
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number | null };

    const version = currentVersion?.version || 0;

    // Migration 1: Initial schema
    if (version < 1) {
      console.log('[StatsDB] Running migration 1: Initial schema...');
      this.db.exec(`
        -- Bridge configurations
        CREATE TABLE bridges (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          model_default TEXT NOT NULL,
          model_allowed TEXT NOT NULL,
          system_prompt TEXT NOT NULL,
          rate_limit_config TEXT,
          access_control_config TEXT,
          status TEXT DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Usage events (7-day retention)
        CREATE TABLE usage_events (
          id TEXT PRIMARY KEY,
          bridge_id TEXT NOT NULL,
          user_fingerprint TEXT,
          user_handle TEXT,
          conversation_id TEXT,
          message_id TEXT,
          timestamp INTEGER NOT NULL,
          model TEXT NOT NULL,
          tokens_in INTEGER NOT NULL,
          tokens_out INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL,
          error_code TEXT,
          metadata TEXT
        );

        CREATE INDEX idx_usage_bridge_time ON usage_events(bridge_id, timestamp DESC);
        CREATE INDEX idx_usage_user ON usage_events(user_fingerprint, timestamp DESC);
        CREATE INDEX idx_usage_conversation ON usage_events(conversation_id, timestamp DESC);

        -- Daily aggregated stats (lifetime retention)
        CREATE TABLE daily_stats (
          id TEXT PRIMARY KEY,
          bridge_id TEXT NOT NULL,
          date TEXT NOT NULL,
          total_requests INTEGER DEFAULT 0,
          total_tokens_in INTEGER DEFAULT 0,
          total_tokens_out INTEGER DEFAULT 0,
          avg_latency_ms INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          top_model TEXT,
          UNIQUE(bridge_id, date)
        );

        CREATE INDEX idx_daily_stats ON daily_stats(bridge_id, date DESC);

        -- Session tracking
        CREATE TABLE session_stats (
          session_id TEXT PRIMARY KEY,
          bridge_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          requests INTEGER DEFAULT 0,
          tokens INTEGER DEFAULT 0
        );

        -- Maintenance log
        CREATE TABLE maintenance_log (
          id TEXT PRIMARY KEY,
          job_type TEXT NOT NULL,
          last_run INTEGER NOT NULL,
          records_processed INTEGER,
          status TEXT
        );
      `);

      this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(1, Date.now());
      console.log('[StatsDB] Migration 1 complete');
    }

    console.log('[StatsDB] All migrations complete. Current version:', version + 1);
  }

  /**
   * Record a usage event
   * 🔒 SECURITY: No message content, only metadata
   */
  logUsageEvent(event: Omit<UsageEvent, 'id' | 'timestamp'>): void {
    if (!this.db) throw new Error('Database not initialized');

    const id = ulid();
    const timestamp = Date.now();

    this.db
      .prepare(`
        INSERT INTO usage_events (
          id, bridge_id, user_fingerprint, user_handle, 
          conversation_id, message_id, timestamp, model,
          tokens_in, tokens_out, latency_ms, error_code, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        event.bridgeId,
        event.userFingerprint,
        event.userHandle,
        event.conversationId,
        event.messageId,
        timestamp,
        event.model,
        event.tokensIn,
        event.tokensOut,
        event.latencyMs,
        event.errorCode,
        event.metadata ? JSON.stringify(event.metadata) : null
      );

    // Update session stats
    if (this.currentSessionId) {
      this.db
        .prepare(`
          UPDATE session_stats 
          SET requests = requests + 1, 
              tokens = tokens + ?
          WHERE session_id = ?
        `)
        .run(event.tokensIn + event.tokensOut, this.currentSessionId);
    }
  }

  /**
   * Start a new session for the given bridge
   */
  startSession(bridgeId: string): string {
    if (!this.db) throw new Error('Database not initialized');

    const sessionId = ulid();
    const startedAt = Date.now();

    this.db
      .prepare(`
        INSERT INTO session_stats (session_id, bridge_id, started_at, requests, tokens)
        VALUES (?, ?, ?, 0, 0)
      `)
      .run(sessionId, bridgeId, startedAt);

    this.currentSessionId = sessionId;
    console.log('[StatsDB] Started session:', sessionId);
    return sessionId;
  }

  /**
   * End the current session
   */
  endSession(): void {
    if (!this.db || !this.currentSessionId) return;

    this.db
      .prepare('UPDATE session_stats SET ended_at = ? WHERE session_id = ?')
      .run(Date.now(), this.currentSessionId);

    console.log('[StatsDB] Ended session:', this.currentSessionId);
    this.currentSessionId = null;
  }

  /**
   * Clean up old events (7-day retention)
   * Should be run daily via background job
   */
  cleanupOldEvents(): number {
    if (!this.db) throw new Error('Database not initialized');

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const result = this.db
      .prepare('DELETE FROM usage_events WHERE timestamp < ?')
      .run(sevenDaysAgo);

    console.log('[StatsDB] Cleaned up', result.changes, 'old events');
    return result.changes;
  }

  /**
   * Aggregate events to daily stats
   * Should be run daily via background job
   */
  aggregateToDailyStats(bridgeId: string, date: string): void {
    if (!this.db) throw new Error('Database not initialized');

    // Calculate stats for the given date
    const stats = this.db
      .prepare(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(tokens_in) as total_tokens_in,
          SUM(tokens_out) as total_tokens_out,
          AVG(latency_ms) as avg_latency_ms,
          SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) as error_count,
          COUNT(DISTINCT user_fingerprint) as unique_users,
          (SELECT model FROM usage_events 
           WHERE bridge_id = ? AND DATE(timestamp/1000, 'unixepoch') = ?
           GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) as top_model
        FROM usage_events
        WHERE bridge_id = ? AND DATE(timestamp/1000, 'unixepoch') = ?
      `)
      .get(bridgeId, date, bridgeId, date) as any;

    // Insert or update daily stats
    this.db
      .prepare(`
        INSERT INTO daily_stats (
          id, bridge_id, date, total_requests, total_tokens_in, total_tokens_out,
          avg_latency_ms, error_count, unique_users, top_model
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bridge_id, date) DO UPDATE SET
          total_requests = excluded.total_requests,
          total_tokens_in = excluded.total_tokens_in,
          total_tokens_out = excluded.total_tokens_out,
          avg_latency_ms = excluded.avg_latency_ms,
          error_count = excluded.error_count,
          unique_users = excluded.unique_users,
          top_model = excluded.top_model
      `)
      .run(
        ulid(),
        bridgeId,
        date,
        stats.total_requests,
        stats.total_tokens_in || 0,
        stats.total_tokens_out || 0,
        Math.round(stats.avg_latency_ms || 0),
        stats.error_count,
        stats.unique_users,
        stats.top_model
      );

    console.log('[StatsDB] Aggregated stats for', date, ':', stats);
  }

  /**
   * Get current session stats
   */
  getCurrentSession(): SessionStat | null {
    if (!this.db || !this.currentSessionId) return null;

    const session = this.db
      .prepare(`
        SELECT * FROM session_stats 
        WHERE session_id = ?
      `)
      .get(this.currentSessionId) as any;

    if (!session) return null;

    return {
      sessionId: session.session_id,
      bridgeId: session.bridge_id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      requests: session.requests,
      tokens: session.tokens,
    };
  }

  /**
   * Get daily stats for a bridge within a date range
   */
  getDailyStats(bridgeId: string, startDate: string, endDate: string): DailyStat[] {
    if (!this.db) return [];

    const rows = this.db
      .prepare(`
        SELECT * FROM daily_stats
        WHERE bridge_id = ? AND date >= ? AND date <= ?
        ORDER BY date DESC
      `)
      .all(bridgeId, startDate, endDate) as any[];

    return rows.map(row => ({
      id: row.id,
      bridgeId: row.bridge_id,
      date: row.date,
      totalRequests: row.total_requests,
      totalTokensIn: row.total_tokens_in,
      totalTokensOut: row.total_tokens_out,
      avgLatencyMs: row.avg_latency_ms,
      errorCount: row.error_count,
      uniqueUsers: row.unique_users,
      topModel: row.top_model,
    }));
  }

  /**
   * Get recent usage events with pagination
   * 🔒 SECURITY: Returns metadata only, no message content
   */
  getRecentEvents(bridgeId: string, limit: number = 100, offset: number = 0): UsageEvent[] {
    if (!this.db) return [];

    const rows = this.db
      .prepare(`
        SELECT * FROM usage_events
        WHERE bridge_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `)
      .all(bridgeId, limit, offset) as any[];

    return rows.map(row => ({
      id: row.id,
      bridgeId: row.bridge_id,
      userFingerprint: row.user_fingerprint,
      userHandle: row.user_handle,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      timestamp: row.timestamp,
      model: row.model,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      latencyMs: row.latency_ms,
      errorCode: row.error_code,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Get lifetime aggregated stats for a bridge
   */
  getBridgeLifetimeStats(bridgeId: string): {
    totalRequests: number;
    totalTokensIn: number;
    totalTokensOut: number;
    avgLatencyMs: number;
    errorCount: number;
    uniqueUsers: number;
    firstSeen: string | null;
    lastSeen: string | null;
  } {
    if (!this.db) {
      return {
        totalRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        avgLatencyMs: 0,
        errorCount: 0,
        uniqueUsers: 0,
        firstSeen: null,
        lastSeen: null,
      };
    }

    const stats = this.db
      .prepare(`
        SELECT 
          SUM(total_requests) as total_requests,
          SUM(total_tokens_in) as total_tokens_in,
          SUM(total_tokens_out) as total_tokens_out,
          AVG(avg_latency_ms) as avg_latency_ms,
          SUM(error_count) as error_count,
          MAX(unique_users) as unique_users,
          MIN(date) as first_seen,
          MAX(date) as last_seen
        FROM daily_stats
        WHERE bridge_id = ?
      `)
      .get(bridgeId) as any;

    if (!stats || !stats.total_requests) {
      return {
        totalRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        avgLatencyMs: 0,
        errorCount: 0,
        uniqueUsers: 0,
        firstSeen: null,
        lastSeen: null,
      };
    }

    return {
      totalRequests: stats.total_requests || 0,
      totalTokensIn: stats.total_tokens_in || 0,
      totalTokensOut: stats.total_tokens_out || 0,
      avgLatencyMs: Math.round(stats.avg_latency_ms || 0),
      errorCount: stats.error_count || 0,
      uniqueUsers: stats.unique_users || 0,
      firstSeen: stats.first_seen,
      lastSeen: stats.last_seen,
    };
  }

  /**
   * Get top users by request count for a bridge
   */
  getTopUsers(bridgeId: string, limit: number = 10): Array<{
    userFingerprint: string;
    userHandle: string | null;
    requestCount: number;
    totalTokens: number;
    avgLatencyMs: number;
    lastSeen: number;
  }> {
    if (!this.db) return [];

    const rows = this.db
      .prepare(`
        SELECT 
          user_fingerprint,
          user_handle,
          COUNT(*) as request_count,
          SUM(tokens_in + tokens_out) as total_tokens,
          AVG(latency_ms) as avg_latency_ms,
          MAX(timestamp) as last_seen
        FROM usage_events
        WHERE bridge_id = ? AND user_fingerprint IS NOT NULL
        GROUP BY user_fingerprint
        ORDER BY request_count DESC
        LIMIT ?
      `)
      .all(bridgeId, limit) as any[];

    return rows.map(row => ({
      userFingerprint: row.user_fingerprint,
      userHandle: row.user_handle,
      requestCount: row.request_count,
      totalTokens: row.total_tokens,
      avgLatencyMs: Math.round(row.avg_latency_ms),
      lastSeen: row.last_seen,
    }));
  }

  /**
   * Get distinct bridge IDs that have events on or before a specific date
   * Used by maintenance jobs to know which bridges need aggregation
   */
  getBridgeIdsWithEvents(date: string): string[] {
    if (!this.db) return [];

    const dateTimestamp = new Date(date + 'T23:59:59Z').getTime();

    const rows = this.db
      .prepare(`
        SELECT DISTINCT bridge_id
        FROM usage_events
        WHERE timestamp <= ?
      `)
      .all(dateTimestamp) as Array<{ bridge_id: string }>;

    return rows.map(row => row.bridge_id);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[StatsDB] Database closed');
    }
  }
}

// Export singleton instance
export const statsDb = new StatsDatabase();
