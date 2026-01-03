import { Html } from '@elysiajs/html';
import { BaseLayout } from '../layouts/base';
import { Card, Button, EmptyState } from '../components/ui';
import type { AuditLog } from '../../types';

interface LogsPageProps {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    action?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

export function LogsPage({ logs, total, page, pageSize, filters }: LogsPageProps) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <BaseLayout title="操作日志 - 证书管理">
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-gray-900">操作日志</h1>

        {/* Filters */}
        <Card>
          <form hx-get="/logs" hx-target="body" hx-push-url="true" class="flex flex-wrap gap-4 items-end">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">操作类型</label>
              <select name="action" class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="">全部</option>
                <option value="domain_create" selected={filters.action === 'domain_create'}>添加域名</option>
                <option value="domain_delete" selected={filters.action === 'domain_delete'}>删除域名</option>
                <option value="cert_check" selected={filters.action === 'cert_check'}>证书检测</option>
                <option value="cert_update" selected={filters.action === 'cert_update'}>证书更新</option>
                <option value="dcdn_sync" selected={filters.action === 'dcdn_sync'}>DCDN同步</option>
                <option value="scheduler_start" selected={filters.action === 'scheduler_start'}>调度器启动</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select name="status" class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="">全部</option>
                <option value="success" selected={filters.status === 'success'}>成功</option>
                <option value="failure" selected={filters.status === 'failure'}>失败</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate || ''}
                class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate || ''}
                class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <Button type="submit">筛选</Button>
            <a href="/logs" class="px-4 py-2 text-gray-600 hover:text-gray-800">重置</a>
          </form>
        </Card>

        {/* Logs Table */}
        <Card>
          {logs.length === 0 ? (
            <EmptyState
              icon="📋"
              title="暂无日志记录"
              description="系统操作日志将显示在这里"
            />
          ) : (
            <>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="text-left text-sm text-gray-500 border-b">
                      <th class="pb-3">时间</th>
                      <th class="pb-3">操作</th>
                      <th class="pb-3">目标</th>
                      <th class="pb-3">状态</th>
                      <th class="pb-3">详情</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    {logs.map(log => (
                      <tr class="hover:bg-gray-50">
                        <td class="py-3 text-sm text-gray-500">
                          {formatDateTime(new Date(log.created_at))}
                        </td>
                        <td class="py-3 font-medium">{formatAction(log.action)}</td>
                        <td class="py-3 text-sm">
                          {log.target_type && (
                            <span class="text-gray-500">
                              {log.target_type}
                              {log.target_id && <span class="ml-1">#{log.target_id}</span>}
                            </span>
                          )}
                        </td>
                        <td class="py-3">
                          <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.status === 'success' ? '成功' : '失败'}
                          </span>
                        </td>
                        <td class="py-3 text-sm text-gray-500 max-w-[300px] truncate">
                          {formatDetails(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div class="flex justify-between items-center mt-4 pt-4 border-t">
                  <span class="text-sm text-gray-500">
                    共 {total} 条记录，第 {page} / {totalPages} 页
                  </span>
                  <div class="flex gap-2">
                    {page > 1 && (
                      <a
                        href={buildPageUrl(page - 1, filters)}
                        class="px-3 py-1 border rounded hover:bg-gray-50"
                      >
                        上一页
                      </a>
                    )}
                    {page < totalPages && (
                      <a
                        href={buildPageUrl(page + 1, filters)}
                        class="px-3 py-1 border rounded hover:bg-gray-50"
                      >
                        下一页
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </BaseLayout>
  );
}

function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'domain_create': '添加域名',
    'domain_delete': '删除域名',
    'domain_update': '更新域名',
    'cert_check': '证书检测',
    'cert_update': '证书更新',
    'dcdn_sync': 'DCDN同步',
    'scheduler_start': '调度器启动',
    'scheduler_stop': '调度器停止',
    'scheduler_task_complete': '调度任务完成',
    'scheduler_task_error': '调度任务错误',
    'scheduler_config_update': '调度配置更新',
    'credential_update': '凭证更新'
  };
  return actionMap[action] || action;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('zh-CN');
}

function formatDetails(details: unknown): string {
  if (!details) return '-';
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      return JSON.stringify(parsed);
    } catch {
      return details;
    }
  }
  return JSON.stringify(details);
}

function buildPageUrl(page: number, filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `/logs?${params.toString()}`;
}
