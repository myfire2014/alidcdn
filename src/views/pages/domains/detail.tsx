import { Html } from '@elysiajs/html';
import { BaseLayout } from '../../layouts/base';
import { Card, Button, StatusBadge, Alert } from '../../components/ui';
import type { Domain, AuditLog } from '../../../types';

interface DomainDetailProps {
  domain: Domain;
  logs: AuditLog[];
}

export function DomainDetailPage({ domain, logs }: DomainDetailProps) {
  const daysRemaining = domain.cert_expiry 
    ? Math.ceil((new Date(domain.cert_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <BaseLayout title={`${domain.domain} - 证书管理`}>
      <div class="space-y-6">
        {/* Header */}
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-3">
              <a href="/domains" class="text-gray-400 hover:text-gray-600">← 返回</a>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mt-2">{domain.domain}</h1>
            {domain.notes && <p class="text-gray-500 mt-1">{domain.notes}</p>}
          </div>
          <div class="flex gap-2">
            <Button
              variant="secondary"
              hx-post={`/api/domains/${domain.id}/check`}
              hx-swap="none"
            >
              检测证书
            </Button>
            <Button
              hx-post={`/api/domains/${domain.id}/update-cert`}
              hx-swap="none"
            >
              更新证书
            </Button>
          </div>
        </div>

        {/* Warning Alert */}
        {domain.cert_status === 'expiring_soon' && (
          <Alert type="warning" message={`证书将在 ${daysRemaining} 天后过期，建议尽快更新`} />
        )}
        {domain.cert_status === 'expired' && (
          <Alert type="error" message="证书已过期，请立即更新" />
        )}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Certificate Info */}
          <Card title="证书信息">
            <dl class="space-y-4">
              <div class="flex justify-between">
                <dt class="text-gray-500">状态</dt>
                <dd><StatusBadge status={domain.cert_status || 'unknown'} /></dd>
              </div>
              <div class="flex flex-col gap-1">
                <dt class="text-gray-500">覆盖域名 ({[domain.domain, ...(domain.alt_domains || [])].length})</dt>
                <dd class="flex flex-wrap gap-1">
                  {[domain.domain, ...(domain.alt_domains || [])].map(name => (
                    <span class="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono">{name}</span>
                  ))}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">过期时间</dt>
                <dd class="font-medium">
                  {domain.cert_expiry ? formatDate(new Date(domain.cert_expiry)) : '-'}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">剩余天数</dt>
                <dd class={`font-medium ${daysRemaining !== null && daysRemaining <= 7 ? 'text-red-600' : daysRemaining !== null && daysRemaining <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {daysRemaining !== null ? `${daysRemaining} 天` : '-'}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">颁发者</dt>
                <dd class="font-medium text-right max-w-[200px] truncate" title={domain.cert_issuer || ''}>
                  {domain.cert_issuer || '-'}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">最后检测</dt>
                <dd>{domain.last_checked ? formatDateTime(new Date(domain.last_checked)) : '从未'}</dd>
              </div>
            </dl>
          </Card>

          {/* Settings */}
          <Card title="域名设置">
            <form hx-put={`/api/domains/${domain.id}`} hx-swap="none" class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">自动续期</p>
                  <p class="text-sm text-gray-500">证书即将过期时自动更新</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="auto_renew" checked={domain.auto_renew} class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">DCDN 同步</p>
                  <p class="text-sm text-gray-500">签发后自动同步到相关联的 DCDN 域名</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="dcdn_enabled" checked={domain.dcdn_enabled} class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">附加域名 (SAN)</label>
                <textarea
                  name="alt_domains"
                  rows="4"
                  placeholder={'*.example.com\nfoo.com'}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                >{(domain.alt_domains || []).join('\n')}</textarea>
                <p class="mt-1 text-sm text-gray-500">每行一个,支持泛域名,与主域名签发在同一张证书</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <input
                  type="text"
                  name="notes"
                  value={domain.notes || ''}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <Button type="submit" class="w-full">保存设置</Button>
            </form>

            <div class="mt-6 pt-6 border-t">
              <h4 class="font-medium text-gray-900 mb-3">DCDN 操作</h4>
              <Button
                variant="secondary"
                class="w-full"
                onclick={`syncAllDcdn(${domain.id}, this)`}
              >
                一键同步到所有相关 DCDN 域名
              </Button>
              <p id={`dcdn-sync-status-${domain.id}`} class="mt-2 text-sm text-gray-500"></p>
            </div>
          </Card>
        </div>

        <script>{`
          async function syncAllDcdn(domainId, btn) {
            const status = document.getElementById('dcdn-sync-status-' + domainId);
            btn.disabled = true;
            btn.textContent = '正在同步...';
            status.textContent = '正在上传证书到相关联的 DCDN 域名...';
            try {
              const res = await fetch('/api/domains/' + domainId + '/sync-dcdn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
              });
              const data = await res.json();
              status.textContent = data.success ? '✓ ' + data.message : '✗ ' + (data.error || '同步失败');
              status.className = 'mt-2 text-sm ' + (data.success ? 'text-green-600' : 'text-red-600');
            } catch (e) {
              status.textContent = '✗ 同步失败: ' + e.message;
              status.className = 'mt-2 text-sm text-red-600';
            } finally {
              btn.disabled = false;
              btn.textContent = '一键同步到所有相关 DCDN 域名';
            }
          }
        `}</script>

        {/* Activity Log */}
        <Card title="操作历史">
          {logs.length === 0 ? (
            <p class="text-gray-500 text-center py-4">暂无操作记录</p>
          ) : (
            <ul class="divide-y">
              {logs.map(log => (
                <li class="py-3 flex justify-between items-center">
                  <div>
                    <span class={`inline-block w-2 h-2 rounded-full mr-2 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span class="font-medium">{formatAction(log.action)}</span>
                    {log.details && (
                      <span class="text-gray-500 text-sm ml-2">
                        {typeof log.details === 'string' ? log.details : ''}
                      </span>
                    )}
                  </div>
                  <span class="text-sm text-gray-400">{formatDateTime(new Date(log.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Danger Zone */}
        <Card title="危险操作" class="border-red-200">
          <div class="flex justify-between items-center">
            <div>
              <p class="font-medium text-red-600">删除域名</p>
              <p class="text-sm text-gray-500">删除后无法恢复</p>
            </div>
            <Button
              variant="danger"
              hx-delete={`/api/domains/${domain.id}`}
              hx-confirm="确定要删除这个域名吗？此操作无法撤销。"
              hx-redirect="/domains"
            >
              删除域名
            </Button>
          </div>
        </Card>
      </div>
    </BaseLayout>
  );
}

function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'domain_create': '创建域名',
    'domain_update': '更新设置',
    'cert_check': '证书检测',
    'cert_update': '证书更新',
    'dcdn_sync': 'DCDN同步'
  };
  return actionMap[action] || action;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('zh-CN');
}
