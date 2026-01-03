import { Elysia } from 'elysia';
import { getDatabase } from '../../db';
import { scheduler } from '../../services/scheduler';
import { credentialStore } from '../../services/credential-store';
import { domainService } from '../../services/domain-service';

export const healthApi = new Elysia({ prefix: '/api' })
  // Health check endpoint
  .get('/health', () => {
    const db = getDatabase();
    let dbStatus = 'ok';
    
    try {
      db.query('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    const schedulerStatus = scheduler.getStatus();
    const statusCounts = domainService.getStatusCounts();

    return {
      status: dbStatus === 'ok' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      components: {
        database: dbStatus,
        scheduler: schedulerStatus.running ? 'running' : 'stopped'
      },
      metrics: {
        totalDomains: statusCounts.total,
        validCerts: statusCounts.valid,
        expiringCerts: statusCounts.expiring_soon,
        expiredCerts: statusCounts.expired
      }
    };
  })

  // Scheduler control
  .post('/scheduler/trigger', async () => {
    await scheduler.triggerNow('cert_check');
    return { success: true, message: 'Certificate check triggered' };
  })

  .post('/scheduler/start', () => {
    scheduler.start();
    return { success: true, message: 'Scheduler started' };
  })

  .post('/scheduler/stop', () => {
    scheduler.stop();
    return { success: true, message: 'Scheduler stopped' };
  });
