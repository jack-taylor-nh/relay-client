/**
 * Stats Overview Component
 * 
 * Displays real-time bridge statistics:
 * - Current session (requests, tokens, uptime)
 * - Lifetime overview (total requests, unique users, first seen)
 * - Recent activity table (last 20 events)
 */

import React, { useState, useEffect } from 'react';

interface SessionStats {
  sessionId: string;
  bridgeId: string;
  startedAt: number;
  endedAt: number | null;
  requests: number;
  tokens: number;
}

interface LifetimeStats {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgLatencyMs: number;
  errorCount: number;
  uniqueUsers: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface UsageEvent {
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
  metadata: any;
}

export default function StatsOverview() {
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionStats | null>(null);
  const [lifetime, setLifetime] = useState<LifetimeStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Load bridge ID from config
  useEffect(() => {
    const loadBridgeId = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        const id = config.bridgeEdge?.id || null;
        setBridgeId(id);
      } catch (error) {
        console.error('[StatsOverview] Failed to load bridge ID:', error);
      }
    };
    loadBridgeId();
  }, []);

  // Fetch stats
  const fetchStats = async () => {
    if (!bridgeId) return;

    try {
      const [sessionData, lifetimeData, eventsData] = await Promise.all([
        window.electronAPI.statsGetCurrentSession?.(),
        window.electronAPI.statsGetLifetime?.(bridgeId),
        window.electronAPI.statsGetRecentEvents?.(bridgeId, 20),
      ]);

      setSession(sessionData);
      setLifetime(lifetimeData);
      setRecentEvents(eventsData || []);
      setLoading(false);
    } catch (error) {
      console.error('[StatsOverview] Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    if (bridgeId) {
      fetchStats();
      const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [bridgeId]);

  // Format uptime duration
  const formatUptime = (startedAt: number) => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  if (!bridgeId) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">No bridge connected. Create a bridge to see stats.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Loading stats...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Statistics</h1>
        <p className="text-muted-foreground">Real-time bridge performance and usage metrics</p>
      </div>

      {/* Current Session */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Current Session</h2>
        {session ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">REQUESTS</p>
              <p className="text-2xl font-bold">{session.requests}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">TOKENS</p>
              <p className="text-2xl font-bold">{session.tokens.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">UPTIME</p>
              <p className="text-2xl font-bold">{formatUptime(session.startedAt)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">STATUS</p>
              <p className="text-2xl font-bold text-green-500">Active</p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No active session. Connect your bridge to start tracking.</p>
        )}
      </div>

      {/* Lifetime Stats */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Lifetime Overview</h2>
        {lifetime && lifetime.totalRequests > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">TOTAL REQUESTS</p>
              <p className="text-2xl font-bold">{lifetime.totalRequests.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Since {formatDate(lifetime.firstSeen)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">TOTAL TOKENS</p>
              <p className="text-2xl font-bold">{(lifetime.totalTokensIn + lifetime.totalTokensOut).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {lifetime.totalTokensIn.toLocaleString()} in / {lifetime.totalTokensOut.toLocaleString()} out
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">AVG LATENCY</p>
              <p className="text-2xl font-bold">{lifetime.avgLatencyMs}ms</p>
              <p className="text-xs text-muted-foreground mt-1">
                {lifetime.uniqueUsers} unique users
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data yet. Stats will appear after processing messages.</p>
        )}

        {lifetime && lifetime.errorCount > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">
              ⚠️ {lifetime.errorCount} errors recorded ({((lifetime.errorCount / lifetime.totalRequests) * 100).toFixed(1)}% error rate)
            </p>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {recentEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Time</th>
                  <th className="pb-2 font-medium text-muted-foreground">User</th>
                  <th className="pb-2 font-medium text-muted-foreground">Model</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Tokens In</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Tokens Out</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Latency</th>
                  <th className="pb-2 font-medium text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-muted/50">
                    <td className="py-2 text-xs">{formatTime(event.timestamp)}</td>
                    <td className="py-2 text-xs font-mono">
                      {event.userFingerprint ? event.userFingerprint.slice(0, 8) + '...' : 'Unknown'}
                    </td>
                    <td className="py-2 text-xs">{event.model}</td>
                    <td className="py-2 text-xs text-right">{event.tokensIn}</td>
                    <td className="py-2 text-xs text-right">{event.tokensOut}</td>
                    <td className="py-2 text-xs text-right">{event.latencyMs}ms</td>
                    <td className="py-2 text-xs text-center">
                      {event.errorCode ? (
                        <span className="text-destructive">✗</span>
                      ) : (
                        <span className="text-green-500">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No recent activity. Send a message to your bridge to see events here.</p>
        )}
      </div>

      {/* Auto-refresh indicator */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Auto-refreshing every 5 seconds</p>
      </div>
    </div>
  );
}
