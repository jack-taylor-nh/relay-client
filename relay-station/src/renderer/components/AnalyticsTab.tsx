/**
 * Analytics Tab Component
 * Provides visualizations and insights into bridge performance
 */

import { useEffect, useState } from 'react';
import RequestVolumeChart from './charts/RequestVolumeChart';
import TokenUsageChart from './charts/TokenUsageChart';
import LatencyDistributionChart from './charts/LatencyDistributionChart';
import ModelUsageChart from './charts/ModelUsageChart';
import ThroughputChart from './charts/ThroughputChart';

interface DailyStat {
  date: string;
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgLatencyMs: number;
}

interface UsageEvent {
  timestamp: number;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export default function AnalyticsTab() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Chart data
  const [requestVolumeData, setRequestVolumeData] = useState<Array<{ date: string; requests: number }>>([]);
  const [tokenUsageData, setTokenUsageData] = useState<Array<{ date: string; tokensIn: number; tokensOut: number }>>([]);
  const [latencyDistData, setLatencyDistData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [throughputDistData, setThroughputDistData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [modelUsageData, setModelUsageData] = useState<Array<{ name: string; value: number; color: string }>>([]);

  // Load bridge ID
  useEffect(() => {
    loadBridgeId();
  }, []);

  // Load analytics data when bridge ID or time range changes
  useEffect(() => {
    if (bridgeId) {
      loadAnalytics();
    }
  }, [bridgeId, timeRange]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!bridgeId) return;
    
    const interval = setInterval(() => {
      loadAnalytics();
    }, 30000);

    return () => clearInterval(interval);
  }, [bridgeId, timeRange]);

  const loadBridgeId = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      if (config?.bridgeEdge?.id) {
        setBridgeId(config.bridgeEdge.id);
      }
    } catch (err) {
      console.error('[AnalyticsTab] Failed to load bridge ID:', err);
    }
  };

  const loadAnalytics = async () => {
    if (!bridgeId) return;

    try {
      setLoading(true);
      
      // Trigger aggregation to ensure latest data
      await window.electronAPI.statsTriggerAggregation?.();
      
      // Wait a moment for aggregation to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      if (timeRange === '7d') {
        startDate.setDate(endDate.getDate() - 7);
      } else if (timeRange === '30d') {
        startDate.setDate(endDate.getDate() - 30);
      } else {
        // 'all' - get data from 1 year ago
        startDate.setFullYear(endDate.getFullYear() - 1);
      }

      // Fetch daily stats
      const dailyStats: DailyStat[] = await window.electronAPI.statsGetDaily?.(
        bridgeId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ) || [];

      // Process request volume data
      const volumeData = dailyStats.map(stat => ({
        date: stat.date,
        requests: stat.totalRequests,
      }));
      setRequestVolumeData(volumeData);

      // Process token usage data
      const tokenData = dailyStats.map(stat => ({
        date: stat.date,
        tokensIn: stat.totalTokensIn,
        tokensOut: stat.totalTokensOut,
      }));
      setTokenUsageData(tokenData);

      // Fetch recent events for latency and model distribution (last 1000 events)
      const recentEvents: UsageEvent[] = await window.electronAPI.statsGetRecentEvents?.(
        bridgeId,
        1000,
        0
      ) || [];

      // Process latency distribution
      const latencyBuckets = {
        'Fast (< 1s)': 0,
        'Good (1-3s)': 0,
        'Moderate (3-5s)': 0,
        'Slow (5-10s)': 0,
        'Very Slow (> 10s)': 0,
      };

      recentEvents.forEach(event => {
        const latency = event.latencyMs / 1000; // Convert to seconds
        if (latency < 1) latencyBuckets['Fast (< 1s)']++;
        else if (latency < 3) latencyBuckets['Good (1-3s)']++;
        else if (latency < 5) latencyBuckets['Moderate (3-5s)']++;
        else if (latency < 10) latencyBuckets['Slow (5-10s)']++;
        else latencyBuckets['Very Slow (> 10s)']++;
      });

      const latencyColors = {
        'Fast (< 1s)': 'hsl(142 76% 36%)',      // green
        'Good (1-3s)': 'hsl(173 58% 39%)',      // teal
        'Moderate (3-5s)': 'hsl(48 96% 53%)',   // yellow
        'Slow (5-10s)': 'hsl(25 95% 53%)',      // orange
        'Very Slow (> 10s)': 'hsl(0 84% 60%)',  // red
      };

      const latencyData = Object.entries(latencyBuckets).map(([name, value]) => ({
        name,
        value,
        color: latencyColors[name as keyof typeof latencyColors],
      }));
      setLatencyDistData(latencyData);

      // Process throughput distribution (tokens/second)
      const throughputBuckets = {
        'Slow (< 50 t/s)': 0,
        'Good (50-100 t/s)': 0,
        'Fast (100-150 t/s)': 0,
        'Very Fast (150-200 t/s)': 0,
        'Excellent (> 200 t/s)': 0,
      };

      recentEvents.forEach(event => {
        if (event.tokensOut > 0 && event.latencyMs > 0) {
          const tokensPerSecond = event.tokensOut / (event.latencyMs / 1000);
          if (tokensPerSecond < 50) throughputBuckets['Slow (< 50 t/s)']++;
          else if (tokensPerSecond < 100) throughputBuckets['Good (50-100 t/s)']++;
          else if (tokensPerSecond < 150) throughputBuckets['Fast (100-150 t/s)']++;
          else if (tokensPerSecond < 200) throughputBuckets['Very Fast (150-200 t/s)']++;
          else throughputBuckets['Excellent (> 200 t/s)']++;
        }
      });

      const throughputColors = {
        'Slow (< 50 t/s)': 'hsl(0 84% 60%)',        // red
        'Good (50-100 t/s)': 'hsl(25 95% 53%)',     // orange
        'Fast (100-150 t/s)': 'hsl(48 96% 53%)',    // yellow
        'Very Fast (150-200 t/s)': 'hsl(173 58% 39%)', // teal
        'Excellent (> 200 t/s)': 'hsl(142 76% 36%)',   // green
      };

      const throughputData = Object.entries(throughputBuckets).map(([name, value]) => ({
        name,
        value,
        color: throughputColors[name as keyof typeof throughputColors],
      }));
      setThroughputDistData(throughputData);

      // Process model usage distribution
      const modelCounts: Record<string, number> = {};
      recentEvents.forEach(event => {
        modelCounts[event.model] = (modelCounts[event.model] || 0) + 1;
      });

      const modelData = Object.entries(modelCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([name, value]) => ({
          name,
          value,
          color: '', // Will be assigned by chart component
        }));
      setModelUsageData(modelData);

    } catch (err) {
      console.error('[AnalyticsTab] Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!bridgeId) return;

    // Combine all data for export
    const rows = [
      ['Date', 'Requests', 'Tokens In', 'Tokens Out'],
      ...requestVolumeData.map((item, idx) => [
        item.date,
        item.requests.toString(),
        tokenUsageData[idx]?.tokensIn?.toString() || '0',
        tokenUsageData[idx]?.tokensOut?.toString() || '0',
      ]),
    ];

    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `relay-analytics-${bridgeId}-${timeRange}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!bridgeId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No active bridge</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a bridge to see analytics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-2">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Visual insights into your bridge's performance and usage patterns
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 border border-border rounded-lg p-1">
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              timeRange === '7d'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              timeRange === '30d'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              timeRange === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Metrics Info Card */}
      <div className="bg-accent/30 border border-primary/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1">Performance Metrics</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><span className="font-medium">Latency:</span> Total request-to-response time (affects UX perception)</p>
              <p><span className="font-medium">Throughput:</span> Tokens/second generation speed (true model performance)</p>
              <p><span className="font-medium">TTFT:</span> Time to First Token - Coming with streaming implementation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Trend Chart */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Request Volume</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Number of requests over time
          </p>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <RequestVolumeChart data={requestVolumeData} />
          )}
        </div>

        {/* Token Usage Chart */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Token Usage</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Input and output tokens processed
          </p>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <TokenUsageChart data={tokenUsageData} />
          )}
        </div>

        {/* Latency Distribution */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Response Latency</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Total time from request to response (UX perception)
          </p>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <LatencyDistributionChart data={latencyDistData} />
          )}
        </div>

        {/* Throughput Distribution */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Token Generation Speed</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Throughput in tokens/second (true performance)
          </p>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <ThroughputChart data={throughputDistData} />
          )}
        </div>

        {/* Model Usage Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Model Usage</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Requests by model type
          </p>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <ModelUsageChart data={modelUsageData} />
          )}
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold mb-1">Export Data</h3>
            <p className="text-xs text-muted-foreground">
              Download analytics data for external analysis
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={loading || requestVolumeData.length === 0}
            className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export to CSV
          </button>
        </div>
      </div>

      {/* Info Card - only show if no data yet */}
      {!loading && requestVolumeData.length === 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">No Data Yet</h4>
              <p className="text-xs text-muted-foreground">
                Send some requests through your bridge to populate these analytics charts. Charts will
                auto-update every 30 seconds once data is available.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
