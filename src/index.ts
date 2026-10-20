import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { initDatabase } from './db';
import { scheduler } from './services/scheduler';
import { auditLogger } from './services/audit-logger';
import { taskQueue } from './services/task-queue';
import { certMonitor } from './services/cert-monitor';
import { certUpdater } from './services/cert-updater';
import { dcdnSyncer } from './services/dcdn-syncer';

// Routes
import { pagesRoute } from './routes/pages';
import { eventsRoute } from './routes/events';
import { domainsApi } from './routes/api/domains';
import { settingsApi } from './routes/api/settings';
import { logsApi } from './routes/api/logs';
import { healthApi } from './routes/api/health';

// Initialize database
initDatabase();

// Setup task executor
taskQueue.setExecutor(async (task) => {
  switch (task.type) {
    case 'check':
      await certMonitor.executeCheckTask(task);
      break;
    case 'update':
      await certUpdater.executeUpdateTask(task);
      break;
    case 'sync':
      // 使用已签发并保存的证书同步到所有相关联的 DCDN 域名
      await dcdnSyncer.executeSyncTask(task);
      break;
    default:
      taskQueue.completeTask(task.id, false, `Unknown task type: ${task.type}`);
  }
});

// Create app
const app = new Elysia()
  .use(html())
  // Error handling
  .onError(({ code, error, set }) => {
    console.error(`Error [${code}]:`, error);
    
    const errorMessage = error && typeof error === 'object' && 'message' in error 
      ? String(error.message) 
      : 'Unknown error';
    
    auditLogger.log({
      action: 'system_error',
      targetType: 'system',
      details: { code, message: errorMessage },
      status: 'failure'
    });

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Not found' };
    }

    set.status = 500;
    return { error: 'Internal server error' };
  })
  // API routes
  .use(domainsApi)
  .use(settingsApi)
  .use(logsApi)
  .use(healthApi)
  // SSE events
  .use(eventsRoute)
  // Page routes
  .use(pagesRoute)
  .listen(Number(process.env.PORT || 3000));

// Start scheduler
scheduler.start();

console.log(`🔐 证书管理面板运行在 http://${app.server?.hostname}:${app.server?.port}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n正在关闭...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭...');
  scheduler.stop();
  process.exit(0);
});

export { app };
