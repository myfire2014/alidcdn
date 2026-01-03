import { Html } from '@elysiajs/html';
import { BaseLayout } from '../layouts/base';
import { Card, StatusBadge, LoadingSpinner } from '../components/ui';
import type { Domain, AuditLog, SchedulerStatus } from '../../types';

interface DashboardProps {
  domains: Domain[];
  recentLogs: AuditLog[];
  schedulerStatus: SchedulerStatus;
}

export function DashboardPage({ domains, recentLogs, schedulerStatus }: DashboardProps) {
  const totalDomains = domains.length;
  const validCount = domains.filter(d => d.cert_status === 'valid').length;
  const expiringCount = domains.filter(d => d.cert_status === 'expiring_soon').length;
  const expiredCount = domains.filter(d => d.cert_status === 'expired').length;

  return (
    <BaseLayout title="仪表盘 - 证书管理">
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-gray-900">仪表盘</h1>
        
        {/* Stats Grid */}
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="域名总数" value={totalDomains} icon="🌐" color="indigo" />
          <StatCard title="证书正常" value={validCount} icon="✅" color="green" />
          <StatCard title="即将过期" value={expiringCount} icon="⚠️" color="yellow" />
          <StatCard title="已过期" value={expiredCount} icon="❌" color="red" />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card title="最近操作">
            <div id="recent-logs" hx-get="/api/logs/recent" hx-trigger="sse:log_created" hx-swap="innerHTML">
              <RecentLogsList logs={recentLogs} />
            </div>
          </Card>

          {/* System Status */}
          <Card title="系统状态">
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-gray-600">调度器状态</span>
                <span class={`px-2 py-1 rounded text-sm ${schedulerStatus.running ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {schedulerStatus.running ? '运行中' : '已停止'}
                </span>
              </div>
              {schedulerStatus.tasks.map(task => (
                <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-600">{task.type === 'cert_check' ? '证书检测' : task.type}</span>
                  <span class="text-gray-500">
                    {task.nextRun ? `下次: ${formatTime(task.nextRun)}` : '未调度'}
                  </span>
                </div>
              ))}
              <div class="pt-4 border-t">
                <button
                  hx-post="/api/scheduler/trigger"
                  hx-swap="none"
                  class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  立即检测所有证书
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Domain List Preview */}
        <Card title="域名概览">
          <div id="domain-list" hx-get="/api/domains/list" hx-trigger="sse:domain_updated, sse:cert_checked" hx-swap="innerHTML">
            <DomainListPreview domains={domains} />
          </div>
        </Card>

        {/* SSE Connection for real-time updates */}
        <div sse-connect="/events" sse-swap="message" style="display:none"></div>
      </div>
    </BaseLayout>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) {
  const colorClasses: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600'
  };
  
  return (
    <div class="bg-white rounded-lg shadow-sm border p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-500">{title}</p>
          <p class="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div class={`p-3 rounded-full ${colorClasses[color]}`}>
          <span class="text-2xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function RecentLogsList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return <p class="text-gray-500 text-center py-4">暂无操作记录</p>;
  }

  return (
    <ul class="divide-y">
      {logs.slice(0, 5).map(log => (
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

function DomainListPreview({ domains }: { domains: Domain[] }) {
  if (domains.length === 0) {
    return (
      <div class="text-center py-8">
        <p class="text-gray-500 mb-4">还没有添加域名</p>
        <a href="/domains" class="text-indigo-600 hover:text-indigo-700">添加第一个域名 →</a>
      </div>
    );
  }

  return (
    <table class="w-full">
      <thead>
        <tr class="text-left text-sm text-gray-500 border-b">
          <th class="pb-3">域名</th>
          <th class="pb-3">状态</th>
          <th class="pb-3">过期时间</th>
          <th class="pb-3">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y">
        {domains.slice(0, 5).map(domain => (
          <tr class="hover:bg-gray-50">
            <td class="py-3 font-medium">{domain.domain}</td>
            <td class="py-3">
              <StatusBadge status={domain.cert_status || 'unknown'} />
            </td>
            <td class="py-3 text-sm text-gray-500">
              {domain.cert_expiry ? formatDate(new Date(domain.cert_expiry)) : '-'}
            </td>
            <td class="py-3">
              <button
                hx-post={`/api/domains/${domain.id}/check`}
                hx-swap="none"
                class="text-indigo-600 hover:text-indigo-700 text-sm"
              >
                检测
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatAction(action: string): string {
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
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
