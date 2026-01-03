import { Html } from '@elysiajs/html';
import { BaseLayout } from '../../layouts/base';
import { Card, Button, StatusBadge, EmptyState, LoadingSpinner } from '../../components/ui';
import type { Domain } from '../../../types';

interface DomainsListProps {
  domains: Domain[];
}

export function DomainsListPage({ domains }: DomainsListProps) {
  return (
    <BaseLayout title="域名管理 - 证书管理">
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-gray-900">域名管理</h1>
          <Button hx-get="/domains/new" hx-target="#modal-container" hx-swap="innerHTML">
            添加域名
          </Button>
        </div>

        <Card>
          <div id="domains-table" hx-get="/api/domains/list" hx-trigger="sse:domain_updated, sse:cert_checked" hx-swap="innerHTML">
            <DomainsTable domains={domains} />
          </div>
        </Card>

        {/* Modal Container */}
        <div id="modal-container"></div>

        {/* SSE Connection */}
        <div sse-connect="/events" sse-swap="message" style="display:none"></div>
      </div>
    </BaseLayout>
  );
}

export function DomainsTable({ domains }: { domains: Domain[] }) {
  if (domains.length === 0) {
    return (
      <EmptyState
        icon="🌐"
        title="还没有添加域名"
        description="添加您的第一个域名开始监控证书状态"
        action={
          <Button hx-get="/domains/new" hx-target="#modal-container" hx-swap="innerHTML">
            添加域名
          </Button>
        }
      />
    );
  }

  return (
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="text-left text-sm text-gray-500 border-b">
            <th class="pb-3 pr-4">
              <input type="checkbox" id="select-all" class="rounded" onchange="toggleSelectAll(this)" />
            </th>
            <th class="pb-3">域名</th>
            <th class="pb-3">证书状态</th>
            <th class="pb-3">过期时间</th>
            <th class="pb-3">剩余天数</th>
            <th class="pb-3">颁发者</th>
            <th class="pb-3">最后检测</th>
            <th class="pb-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {domains.map(domain => (
            <DomainRow domain={domain} />
          ))}
        </tbody>
      </table>

      {/* Batch Actions */}
      <div id="batch-actions" class="hidden mt-4 pt-4 border-t flex items-center gap-4">
        <span class="text-sm text-gray-500">已选择 <span id="selected-count">0</span> 个域名</span>
        <Button variant="secondary" size="sm" hx-post="/api/domains/batch/check" hx-include="[name='domain_ids']:checked">
          批量检测
        </Button>
        <Button variant="danger" size="sm" hx-delete="/api/domains/batch" hx-include="[name='domain_ids']:checked" hx-confirm="确定要删除选中的域名吗？">
          批量删除
        </Button>
      </div>

      <script>{`
        function toggleSelectAll(checkbox) {
          document.querySelectorAll('[name="domain_ids"]').forEach(cb => cb.checked = checkbox.checked);
          updateBatchActions();
        }
        function updateBatchActions() {
          const checked = document.querySelectorAll('[name="domain_ids"]:checked').length;
          document.getElementById('selected-count').textContent = checked;
          document.getElementById('batch-actions').classList.toggle('hidden', checked === 0);
        }
        document.querySelectorAll('[name="domain_ids"]').forEach(cb => cb.addEventListener('change', updateBatchActions));
      `}</script>
    </div>
  );
}

function DomainRow({ domain }: { domain: Domain }) {
  const daysRemaining = domain.cert_expiry 
    ? Math.ceil((new Date(domain.cert_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <tr class="hover:bg-gray-50" id={`domain-${domain.id}`}>
      <td class="py-3 pr-4">
        <input type="checkbox" name="domain_ids" value={domain.id} class="rounded" />
      </td>
      <td class="py-3">
        <a href={`/domains/${domain.id}`} class="font-medium text-indigo-600 hover:text-indigo-700">
          {domain.domain}
        </a>
      </td>
      <td class="py-3">
        <StatusBadge status={domain.cert_status || 'unknown'} />
      </td>
      <td class="py-3 text-sm text-gray-500">
        {domain.cert_expiry ? formatDate(new Date(domain.cert_expiry)) : '-'}
      </td>
      <td class="py-3">
        {daysRemaining !== null ? (
          <span class={`text-sm font-medium ${daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
            {daysRemaining} 天
          </span>
        ) : '-'}
      </td>
      <td class="py-3 text-sm text-gray-500 max-w-[150px] truncate" title={domain.cert_issuer || ''}>
        {domain.cert_issuer || '-'}
      </td>
      <td class="py-3 text-sm text-gray-500">
        {domain.last_checked ? formatDateTime(new Date(domain.last_checked)) : '从未'}
      </td>
      <td class="py-3 text-right">
        <div class="flex justify-end gap-2">
          <button
            hx-post={`/api/domains/${domain.id}/check`}
            hx-swap="none"
            class="text-indigo-600 hover:text-indigo-700 text-sm"
            hx-indicator={`#check-indicator-${domain.id}`}
          >
            <span class="htmx-indicator" id={`check-indicator-${domain.id}`}><LoadingSpinner class="h-4 w-4" /></span>
            <span>检测</span>
          </button>
          <button
            hx-post={`/api/domains/${domain.id}/update-cert`}
            hx-swap="none"
            class="text-green-600 hover:text-green-700 text-sm"
          >
            更新
          </button>
          <button
            hx-post={`/api/domains/${domain.id}/sync-dcdn`}
            hx-swap="none"
            class="text-blue-600 hover:text-blue-700 text-sm"
          >
            同步
          </button>
          <button
            hx-delete={`/api/domains/${domain.id}`}
            hx-target={`#domain-${domain.id}`}
            hx-swap="outerHTML"
            hx-confirm="确定要删除这个域名吗？"
            class="text-red-600 hover:text-red-700 text-sm"
          >
            删除
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
