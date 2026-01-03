import { Cron } from 'croner';
import { getDatabase } from '../db';
import { certMonitor } from './cert-monitor';
import { auditLogger } from './audit-logger';
import type { SchedulerConfig, SchedulerStatus, ScheduleConfig } from '../types';

export class Scheduler {
  private jobs: Map<string, Cron> = new Map();
  private running = false;

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.loadAndStartJobs();
    
    auditLogger.log({
      action: 'scheduler_start',
      targetType: 'system',
      details: {},
      status: 'success'
    });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) return;

    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    this.running = false;

    auditLogger.log({
      action: 'scheduler_stop',
      targetType: 'system',
      details: {},
      status: 'success'
    });
  }

  /**
   * Load jobs from database and start them
   */
  private loadAndStartJobs(): void {
    const db = getDatabase();
    const configs = db.query<SchedulerConfig, []>(
      'SELECT * FROM scheduler_config WHERE enabled = 1'
    ).all();

    for (const config of configs) {
      this.startJob(config);
    }
  }

  /**
   * Start a single job
   */
  private startJob(config: SchedulerConfig): void {
    // Stop existing job if any
    const existingJob = this.jobs.get(config.task_type);
    if (existingJob) {
      existingJob.stop();
    }

    const job = new Cron(config.cron_expression, {
      name: config.task_type,
      catch: (error) => {
        console.error(`Scheduler error for ${config.task_type}:`, error);
        auditLogger.log({
          action: 'scheduler_error',
          targetType: 'scheduler',
          details: { taskType: config.task_type, error: String(error) },
          status: 'failure'
        });
      }
    }, async () => {
      await this.executeTask(config.task_type);
    });

    this.jobs.set(config.task_type, job);
    this.updateNextRun(config.task_type, job.nextRun());
  }

  /**
   * Execute a scheduled task
   */
  private async executeTask(taskType: string): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Update last run time
    db.run(
      'UPDATE scheduler_config SET last_run = ? WHERE task_type = ?',
      [now, taskType]
    );

    try {
      switch (taskType) {
        case 'cert_check':
          await certMonitor.checkAllDomains();
          break;
        default:
          console.warn(`Unknown task type: ${taskType}`);
      }

      auditLogger.log({
        action: 'scheduler_task_complete',
        targetType: 'scheduler',
        details: { taskType },
        status: 'success'
      });
    } catch (error) {
      auditLogger.log({
        action: 'scheduler_task_error',
        targetType: 'scheduler',
        details: { taskType, error: String(error) },
        status: 'failure'
      });
    }

    // Update next run time
    const job = this.jobs.get(taskType);
    if (job) {
      this.updateNextRun(taskType, job.nextRun());
    }
  }

  /**
   * Update next run time in database
   */
  private updateNextRun(taskType: string, nextRun: Date | null): void {
    const db = getDatabase();
    db.run(
      'UPDATE scheduler_config SET next_run = ? WHERE task_type = ?',
      [nextRun?.toISOString() ?? null, taskType]
    );
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(taskType: string, config: ScheduleConfig): void {
    const db = getDatabase();
    
    db.run(`
      INSERT INTO scheduler_config (task_type, cron_expression, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(task_type) DO UPDATE SET
        cron_expression = excluded.cron_expression,
        enabled = excluded.enabled
    `, [taskType, config.cronExpression, config.enabled ? 1 : 0]);

    // Restart job if scheduler is running
    if (this.running) {
      const existingJob = this.jobs.get(taskType);
      if (existingJob) {
        existingJob.stop();
        this.jobs.delete(taskType);
      }

      if (config.enabled) {
        const dbConfig = db.query<SchedulerConfig, [string]>(
          'SELECT * FROM scheduler_config WHERE task_type = ?'
        ).get(taskType);
        
        if (dbConfig) {
          this.startJob(dbConfig);
        }
      }
    }

    auditLogger.log({
      action: 'scheduler_config_update',
      targetType: 'scheduler',
      details: { taskType, ...config },
      status: 'success'
    });
  }

  /**
   * Get scheduler status
   */
  getStatus(): SchedulerStatus {
    const db = getDatabase();
    const configs = db.query<SchedulerConfig, []>(
      'SELECT * FROM scheduler_config'
    ).all();

    return {
      running: this.running,
      tasks: configs.map(config => ({
        type: config.task_type,
        enabled: Boolean(config.enabled),
        lastRun: config.last_run ? new Date(config.last_run) : null,
        nextRun: config.next_run ? new Date(config.next_run) : null
      }))
    };
  }

  /**
   * Get configuration for a task type
   */
  getConfig(taskType: string): SchedulerConfig | null {
    const db = getDatabase();
    return db.query<SchedulerConfig, [string]>(
      'SELECT * FROM scheduler_config WHERE task_type = ?'
    ).get(taskType) ?? null;
  }

  /**
   * Manually trigger a task
   */
  async triggerNow(taskType: string): Promise<void> {
    await this.executeTask(taskType);
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
export const scheduler = new Scheduler();
