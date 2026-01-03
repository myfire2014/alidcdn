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
          <div class="flex gap-2">
            <Button variant="secondary" onclick="openDCDNImportModal()">
              从 DCDN 导入
            </Button>
            <Button hx-get="/domains/new" hx-target="#modal-container" hx-swap="innerHTML">
              添加域名
            </Button>
          </div>
        </div>

        <Card>
          <div id="domains-table" hx-get="/api/domains/list" hx-trigger="sse:domain_updated, sse:cert_checked" hx-swap="innerHTML">
            <DomainsTable domains={domains} />
          </div>
        </Card>

        {/* Modal Container */}
        <div id="modal-container"></div>

        {/* DCDN Import Modal */}
        <div id="dcdn-import-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div class="px-6 py-4 border-b flex justify-between items-center">
              <h3 class="text-lg font-semibold">从 DCDN 导入域名</h3>
              <button onclick="closeDCDNImportModal()" class="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div id="dcdn-domains-content" class="p-6 overflow-y-auto flex-1">
              <div class="text-center py-8">
                <div class="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
                <p class="mt-4 text-gray-500">正在获取 DCDN 域名列表...</p>
              </div>
            </div>
            <div class="px-6 py-4 border-t flex justify-end gap-2">
              <Button variant="secondary" onclick="closeDCDNImportModal()">取消</Button>
              <Button id="import-selected-btn" onclick="importSelectedDomains()" disabled>导入选中</Button>
            </div>
          </div>
        </div>

        <script>{`
          async function openDCDNImportModal() {
            document.getElementById('dcdn-import-modal').classList.remove('hidden');
            try {
              const res = await fetch('/api/domains/dcdn-list');
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              renderDCDNDomains(data.domains);
            } catch (e) {
              document.getElementById('dcdn-domains-content').innerHTML = 
                '<div class="text-center py-8 text-red-500">获取失败: ' + e.message + '</div>';
            }
          }

          function closeDCDNImportModal() {
            document.getElementById('dcdn-import-modal').classList.add('hidden');
          }

          function renderDCDNDomains(domains) {
            if (!domains.length) {
              document.getElementById('dcdn-domains-content').innerHTML = 
                '<div class="text-center py-8 text-gray-500">没有找到 DCDN 域名</div>';
              return;
            }
            const statusMap = { online: '正常', offline: '停用', configuring: '配置中', checking: '审核中', check_failed: '审核失败' };
            const html = '<div class="mb-4 flex items-center gap-2"><input type="checkbox" id="select-all-dcdn" onchange="toggleAllDCDN(this)" class="rounded" /><label for="select-all-dcdn" class="text-sm text-gray-600">全选</label><span class="ml-auto text-sm text-gray-500">共 ' + domains.length + ' 个域名</span></div>' +
              '<div class="space-y-2 max-h-96 overflow-y-auto">' + domains.map(d => 
                '<label class="flex items-center gap-3 p-3 border rounded hover:bg-gray-50 cursor-pointer">' +
                  '<input type="checkbox" name="dcdn_domain" value="' + d.domainName + '" class="rounded dcdn-checkbox" onchange="updateImportBtn()" />' +
                  '<div class="flex-1 min-w-0"><div class="font-medium truncate">' + d.domainName + '</div>' +
                  '<div class="text-xs text-gray-500">状态: ' + (statusMap[d.domainStatus] || d.domainStatus) + ' | SSL: ' + (d.sslProtocol === 'on' ? '已开启' : '未开启') + '</div></div></label>'
              ).join('') + '</div>';
            document.getElementById('dcdn-domains-content').innerHTML = html;
          }

          function toggleAllDCDN(checkbox) {
            document.querySelectorAll('.dcdn-checkbox').forEach(cb => cb.checked = checkbox.checked);
            updateImportBtn();
          }

          function updateImportBtn() {
            const count = document.querySelectorAll('.dcdn-checkbox:checked').length;
            const btn = document.getElementById('import-selected-btn');
            btn.disabled = count === 0;
            btn.textContent = count > 0 ? '导入选中 (' + count + ')' : '导入选中';
          }

          async function importSelectedDomains() {
            const selected = Array.from(document.querySelectorAll('.dcdn-checkbox:checked')).map(cb => cb.value);
            if (!selected.length) return;
            try {
              const res = await fetch('/api/domains/import-dcdn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: selected })
              });
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              closeDCDNImportModal();
              alert('导入成功: ' + data.imported.length + ' 个' + (data.skipped.length ? ', 跳过: ' + data.skipped.length + ' 个(已存在)' : ''));
            } catch (e) {
              alert('导入失败: ' + e.message);
            }
          }

          // Certificate update with SSE
          let certUpdateEventSource = null;
          
          function startCertUpdate(domainId, domainName) {
            const modal = document.getElementById('cert-update-modal');
            const title = document.getElementById('cert-update-title');
            const logs = document.getElementById('cert-update-logs');
            const progress = document.getElementById('cert-update-progress');
            const closeBtn = document.getElementById('cert-update-close');
            
            title.textContent = '更新证书: ' + domainName;
            logs.innerHTML = '';
            progress.style.width = '0%';
            closeBtn.disabled = true;
            modal.classList.remove('hidden');
            
            addLog('info', '连接服务器...');
            
            certUpdateEventSource = new EventSource('/api/domains/' + domainId + '/update-cert/stream');
            
            certUpdateEventSource.addEventListener('start', (e) => {
              const data = JSON.parse(e.data);
              addLog('info', data.message);
            });
            
            certUpdateEventSource.addEventListener('progress', (e) => {
              const data = JSON.parse(e.data);
              addLog('step', '[' + data.step + '] ' + data.message);
              progress.style.width = data.progress + '%';
            });
            
            certUpdateEventSource.addEventListener('complete', (e) => {
              const data = JSON.parse(e.data);
              addLog('success', '✓ ' + data.message);
              progress.style.width = '100%';
            });
            
            certUpdateEventSource.addEventListener('error', (e) => {
              if (e.data) {
                const data = JSON.parse(e.data);
                addLog('error', '✗ ' + data.message);
              }
            });
            
            certUpdateEventSource.addEventListener('end', (e) => {
              closeBtn.disabled = false;
              certUpdateEventSource.close();
              certUpdateEventSource = null;
              // Refresh domain list
              htmx.trigger('#domains-table', 'sse:domain_updated');
            });
            
            certUpdateEventSource.onerror = () => {
              addLog('error', '连接断开');
              closeBtn.disabled = false;
              if (certUpdateEventSource) {
                certUpdateEventSource.close();
                certUpdateEventSource = null;
              }
            };
          }
          
          function addLog(type, message) {
            const logs = document.getElementById('cert-update-logs');
            const colors = { info: 'text-gray-600', step: 'text-blue-600', success: 'text-green-600', error: 'text-red-600' };
            const time = new Date().toLocaleTimeString('zh-CN');
            logs.innerHTML += '<div class="' + (colors[type] || 'text-gray-600') + '"><span class="text-gray-400 text-xs">' + time + '</span> ' + message + '</div>';
            logs.scrollTop = logs.scrollHeight;
          }
          
          function closeCertUpdateModal() {
            document.getElementById('cert-update-modal').classList.add('hidden');
            if (certUpdateEventSource) {
              certUpdateEventSource.close();
              certUpdateEventSource = null;
            }
          }
        `}</script>

        {/* Certificate Update Modal */}
        <div id="cert-update-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div class="px-6 py-4 border-b flex justify-between items-center">
              <h3 id="cert-update-title" class="text-lg font-semibold">更新证书</h3>
              <button onclick="closeCertUpdateModal()" class="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div class="p-6">
              <div class="mb-4">
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div id="cert-update-progress" class="h-full bg-indigo-600 transition-all duration-300" style="width: 0%"></div>
                </div>
              </div>
              <div id="cert-update-logs" class="h-64 overflow-y-auto bg-gray-50 rounded p-3 font-mono text-sm space-y-1"></div>
            </div>
            <div class="px-6 py-4 border-t flex justify-end">
              <Button id="cert-update-close" onclick="closeCertUpdateModal()" disabled>关闭</Button>
            </div>
          </div>
        </div>

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
        <input type="checkbox" name="domain_ids" value={String(domain.id)} class="rounded" />
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
            onclick={`startCertUpdate(${domain.id}, '${domain.domain}')`}
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
