import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { initDatabase } from './db';
import { scheduler } from './services/scheduler';
import { auditLogger } from './services/audit-logger';

// Routes
import { pagesRoute } from './routes/pages';
import { eventsRoute } from './routes/events';
import { domainsApi } from './routes/api/domains';
import { settingsApi } from './routes/api/settings';
import { logsApi } from './routes/api/logs';
import { healthApi } from './routes/api/health';

// Initialize database
initDatabase();

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
  .listen(3000);

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
