import { Elysia, t } from 'elysia';
import { Html } from '@elysiajs/html';
import { auditLogger } from '../../services/audit-logger';
import type { AuditLog } from '../../types';

export const logsApi = new Elysia({ prefix: '/api/logs' })
  // Get recent logs (for dashboard)
  .get('/recent', () => {
    const logs = auditLogger.getRecent(5);
    return <RecentLogsList logs={logs} />;
  })

  // Query logs with filters
  .get('/', ({ query }) => {
    const page = parseInt(query.page || '1');
    const pageSize = parseInt(query.pageSize || '20');
    
    const result = auditLogger.query({
      action: query.action || undefined,
      status: query.status as 'success' | 'failure' | undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      pageSize
    });

    return result;
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      pageSize: t.Optional(t.String()),
      action: t.Optional(t.String()),
      status: t.Optional(t.String()),
      startDate: t.Optional(t.String()),
      endDate: t.Optional(t.String())
    })
  });

// Helper component for recent logs
function RecentLogsList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return <p class="text-gray-500 text-center py-4">暂无操作记录</p>;
  }

  const formatAction = (action: string): string => {
    const actionMap: Record<string, string> = {
      'domain_create': '添加域名',
      'domain_delete': '删除域名',
      'cert_check': '证书检测',
      'cert_update': '证书更新',
      'dcdn_sync': 'DCDN同步',
      'scheduler_start': '调度器启动',
      'scheduler_stop': '调度器停止'
    };
    return actionMap[action] || action;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ul class="divide-y">
      {logs.map(log => (
        <li class="py-3 flex justify-between items-center">
          <div>
            <span class="font-medium text-gray-900">{formatAction(log.action)}</span>
            {log.target_id && <span class="text-gray-500 ml-2">#{log.target_id}</span>}
          </div>
          <span class="text-sm text-gray-400">{formatTime(new Date(log.created_at))}</span>
        </li>
      ))}
    </ul>
  );
}
