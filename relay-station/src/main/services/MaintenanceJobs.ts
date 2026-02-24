/**
 * Maintenance Jobs Service
 * 
 * Runs background tasks to:
 * 1. Clean up old usage events (7-day retention)
 * 2. Aggregate daily statistics
 * 3. Maintain database health
 * 
 * Jobs run on a schedule when relay-station is active.
 */

import { statsDb } from './StatsDatabase';

export class MaintenanceJobs {
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private aggregationIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start all maintenance jobs
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Maintenance] Jobs already running');
      return;
    }

    console.log('[Maintenance] Starting background jobs...');

    // Run cleanup daily at 3 AM (or on start if not run today)
    this.scheduleCleanup();

    // Run aggregation every hour
    this.scheduleAggregation();

    // Run initial cleanup on start if needed
    this.runCleanupIfNeeded();

    this.isRunning = true;
    console.log('[Maintenance] Background jobs started');
  }

  /**
   * Stop all maintenance jobs
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    if (this.aggregationIntervalId) {
      clearInterval(this.aggregationIntervalId);
      this.aggregationIntervalId = null;
    }

    this.isRunning = false;
    console.log('[Maintenance] Background jobs stopped');
  }

  /**
   * Manually trigger aggregation (e.g., for testing or immediate updates)
   */
  runAggregationNow(): void {
    console.log('[Maintenance] Manual aggregation triggered');
    this.runAggregation();
  }

  /**
   * Schedule daily cleanup job (runs every 24 hours)
   */
  private scheduleCleanup(): void {
    // Run every 24 hours
    const INTERVAL = 24 * 60 * 60 * 1000;

    this.cleanupIntervalId = setInterval(() => {
      this.runCleanup();
    }, INTERVAL);
  }

  /**
   * Schedule aggregation job (runs every hour)
   */
  private scheduleAggregation(): void {
    // Run every hour
    const INTERVAL = 60 * 60 * 1000;

    this.aggregationIntervalId = setInterval(() => {
      this.runAggregation();
    }, INTERVAL);

    // Also run on start
    setTimeout(() => this.runAggregation(), 5000); // Wait 5 seconds after start
  }

  /**
   * Run cleanup if not run recently
   */
  private async runCleanupIfNeeded(): Promise<void> {
    // Check when last cleanup was run
    const lastRun = await this.getLastJobRun('cleanup');
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    if (!lastRun || lastRun < dayAgo) {
      console.log('[Maintenance] Running initial cleanup...');
      this.runCleanup();
    }
  }

  /**
   * Execute cleanup job
   */
  private runCleanup(): void {
    try {
      console.log('[Maintenance] Running cleanup job...');
      const startTime = Date.now();

      // Delete events older than 7 days
      const recordsDeleted = statsDb.cleanupOldEvents();
      
      const duration = Date.now() - startTime;

      // Log to maintenance table
      this.logJobRun('cleanup', recordsDeleted, 'success');

      console.log(`[Maintenance] Cleanup completed in ${duration}ms. Deleted ${recordsDeleted} old events.`);
    } catch (error) {
      console.error('[Maintenance] Cleanup job failed:', error);
      this.logJobRun('cleanup', 0, 'error');
    }
  }

  /**
   * Execute aggregation job
   */
  private runAggregation(): void {
    try {
      console.log('[Maintenance] Running aggregation job...');
      const startTime = Date.now();

      // Aggregate for yesterday and today
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const datesToAggregate = [
        yesterday.toISOString().split('T')[0], // YYYY-MM-DD
        today.toISOString().split('T')[0],     // YYYY-MM-DD
      ];

      let totalBridges = 0;

      for (const dateStr of datesToAggregate) {
        const bridgeIds = this.getBridgeIdsWithEvents(dateStr);
        
        for (const bridgeId of bridgeIds) {
          statsDb.aggregateToDailyStats(bridgeId, dateStr);
        }

        totalBridges += bridgeIds.length;
      }

      const duration = Date.now() - startTime;

      // Log to maintenance table
      this.logJobRun('aggregation', totalBridges, 'success');

      console.log(
        `[Maintenance] Aggregation completed in ${duration}ms. Processed ${totalBridges} bridge-days.`
      );
    } catch (error) {
      console.error('[Maintenance] Aggregation job failed:', error);
      this.logJobRun('aggregation', 0, 'error');
    }
  }

  /**
   * Get bridge IDs that have events on a given date
   */
  private getBridgeIdsWithEvents(date: string): string[] {
    try {
      // Query the database for distinct bridge IDs with events on this date
      const bridgeIds = statsDb.getBridgeIdsWithEvents(date);
      return bridgeIds;
    } catch (error) {
      console.error('[Maintenance] Failed to get bridge IDs:', error);
      return [];
    }
  }

  /**
   * Get last run time for a job type
   */
  private async getLastJobRun(_jobType: string): Promise<number | null> {
    // Query maintenance_log table
    // For now, return null to force initial run
    // TODO: Implement database query
    return null;
  }

  /**
   * Log job execution to maintenance_log table
   */
  private logJobRun(jobType: string, recordsProcessed: number, status: string): void {
    // TODO: Implement database insert
    console.log(
      `[Maintenance] Job logged: ${jobType}, ${recordsProcessed} records, status: ${status}`
    );
  }
}

// Export singleton instance
export const maintenanceJobs = new MaintenanceJobs();
