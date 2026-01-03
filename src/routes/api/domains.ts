import { Elysia, t } from 'elysia';
import { domainService } from '../../services/domain-service';
import { certMonitor } from '../../services/cert-monitor';
import { certUpdater } from '../../services/cert-updater';
import { dcdnSyncer } from '../../services/dcdn-syncer';
import { auditLogger } from '../../services/audit-logger';
import { sseController } from '../../controllers/sse-controller';
import type { Domain } from '../../types';

function renderDomainsTable(domains: Domain[]): string {
  if (domains.length === 0) {
    return `<div class="text-center py-12">
      <div class="text-4xl mb-4">🌐</div>
      <h3 class="text-lg font-medium text-gray-900 mb-2">还没有添加域名</h3>
      <p class="text-gray-500 mb-4">添加您的第一个域名开始监控证书状态</p>
    </div>`;
  }

  const statusStyles: Record<string, string> = {
    valid: 'bg-green-100 text-green-800',
    expiring_soon: 'bg-yellow-100 text-yellow-800',
    expired: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  };

  const statusLabels: Record<string, string> = {
    valid: '正常', expiring_soon: '即将过期', expired: '已过期', unknown: '未知', error: '错误'
  };

  const rows = domains.map(d => {
    const status = d.cert_status || 'unknown';
    const days = d.cert_expiry ? Math.ceil((new Date(d.cert_expiry).getTime() - Date.now()) / 86400000) : null;
    const daysColor = days !== null ? (days <= 7 ? 'text-red-600' : days <= 30 ? 'text-yellow-600' : 'text-green-600') : '';
    return `<tr class="hover:bg-gray-50" id="domain-${d.id}">
      <td class="py-3 pr-4"><input type="checkbox" name="domain_ids" value="${d.id}" class="rounded" /></td>
      <td class="py-3"><a href="/domains/${d.id}" class="font-medium text-indigo-600 hover:text-indigo-700">${d.domain}</a></td>
      <td class="py-3"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}">${statusLabels[status]}</span></td>
      <td class="py-3 text-sm text-gray-500">${d.cert_expiry ? new Date(d.cert_expiry).toLocaleDateString('zh-CN') : '-'}</td>
      <td class="py-3">${days !== null ? `<span class="text-sm font-medium ${daysColor}">${days} 天</span>` : '-'}</td>
      <td class="py-3 text-sm text-gray-500 max-w-[150px] truncate">${d.cert_issuer || '-'}</td>
      <td class="py-3 text-sm text-gray-500">${d.last_checked ? new Date(d.last_checked).toLocaleString('zh-CN') : '从未'}</td>
      <td class="py-3 text-right"><div class="flex justify-end gap-2">
        <button hx-post="/api/domains/${d.id}/check" hx-swap="none" class="text-indigo-600 text-sm">检测</button>
        <button hx-post="/api/domains/${d.id}/update-cert" hx-swap="none" class="text-green-600 text-sm">更新</button>
        <button hx-delete="/api/domains/${d.id}" hx-target="#domain-${d.id}" hx-swap="outerHTML" hx-confirm="确定删除?" class="text-red-600 text-sm">删除</button>
      </div></td>
    </tr>`;
  }).join('');

  return `<table class="w-full"><thead><tr class="text-left text-sm text-gray-500 border-b">
    <th class="pb-3 pr-4"><input type="checkbox" id="select-all" class="rounded" /></th>
    <th class="pb-3">域名</th><th class="pb-3">状态</th><th class="pb-3">过期时间</th>
    <th class="pb-3">剩余</th><th class="pb-3">颁发者</th><th class="pb-3">最后检测</th><th class="pb-3 text-right">操作</th>
  </tr></thead><tbody class="divide-y">${rows}</tbody></table>`;
}

export const domainsApi = new Elysia({ prefix: '/api/domains' })
  .get('/list', () => new Response(renderDomainsTable(domainService.list()), { headers: { 'Content-Type': 'text/html' } }))
  
  .post('/', async ({ body, set }) => {
    try {
      const domain = domainService.create({
        domain: body.domain,
        notes: body.notes || undefined,
        auto_renew: body.auto_renew === 'on' || body.auto_renew === true,
        dcdn_enabled: body.dcdn_enabled === 'on' || body.dcdn_enabled === true
      });
      auditLogger.log({ action: 'domain_create', targetType: 'domain', targetId: domain.id, details: { domain: domain.domain }, status: 'success' });
      sseController.broadcast({ type: 'domain_updated', data: { id: domain.id } });
      return new Response(renderDomainsTable(domainService.list()), { headers: { 'Content-Type': 'text/html' } });
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { body: t.Object({ domain: t.String(), notes: t.Optional(t.String()), auto_renew: t.Optional(t.Union([t.String(), t.Boolean()])), dcdn_enabled: t.Optional(t.Union([t.String(), t.Boolean()])) }) })

  .put('/:id', async ({ params, body, set }) => {
    try {
      const id = parseInt(params.id);
      domainService.update(id, { notes: body.notes, auto_renew: body.auto_renew === 'on' || body.auto_renew === true, dcdn_enabled: body.dcdn_enabled === 'on' || body.dcdn_enabled === true });
      auditLogger.log({ action: 'domain_update', targetType: 'domain', targetId: id, details: body as Record<string, unknown>, status: 'success' });
      sseController.broadcast({ type: 'domain_updated', data: { id } });
      return { success: true };
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { params: t.Object({ id: t.String() }), body: t.Object({ notes: t.Optional(t.String()), auto_renew: t.Optional(t.Union([t.String(), t.Boolean()])), dcdn_enabled: t.Optional(t.Union([t.String(), t.Boolean()])) }) })

  .delete('/:id', async ({ params, set }) => {
    try {
      const id = parseInt(params.id);
      const domain = domainService.get(id);
      domainService.delete(id);
      auditLogger.log({ action: 'domain_delete', targetType: 'domain', targetId: id, details: { domain: domain?.domain }, status: 'success' });
      sseController.broadcast({ type: 'domain_updated', data: { id } });
      return '';
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { params: t.Object({ id: t.String() }) })

  .post('/:id/check', async ({ params, set }) => {
    try {
      const id = parseInt(params.id);
      const domain = domainService.get(id);
      if (!domain) { set.status = 404; return { error: 'Not found' }; }
      await certMonitor.checkDomain(domain.domain);
      return { success: true };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { params: t.Object({ id: t.String() }) })

  .post('/:id/update-cert', async ({ params, set }) => {
    try {
      const id = parseInt(params.id);
      const domain = domainService.get(id);
      if (!domain) { set.status = 404; return { error: 'Not found' }; }
      const result = await certUpdater.updateCertificate(id);
      if (!result.success) {
        set.status = 500;
        return { error: result.message };
      }
      return { success: true, message: result.message, certificateId: result.certificateId };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { params: t.Object({ id: t.String() }) })

  .post('/:id/sync-dcdn', async ({ params, set }) => {
    try {
      const id = parseInt(params.id);
      const domain = domainService.get(id);
      if (!domain) { set.status = 404; return { error: 'Not found' }; }
      // Enqueue sync task - actual sync requires certificate data
      const taskId = dcdnSyncer.enqueueSync(id);
      return { success: true, taskId };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed' };
    }
  }, { params: t.Object({ id: t.String() }) })

  .get('/dcdn-list', async ({ set }) => {
    try {
      const domains = await dcdnSyncer.listDCDNDomains();
      return { success: true, domains };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed to fetch DCDN domains' };
    }
  })

  .post('/import-dcdn', async ({ body, set }) => {
    try {
      const domainNames = Array.isArray(body.domains) ? body.domains : [body.domains];
      const imported: string[] = [];
      const skipped: string[] = [];

      for (let domainName of domainNames) {
        // Clean domain: remove trailing dot (FQDN format) and trim
        domainName = domainName.trim().replace(/\.$/, '');
        
        if (!domainName) continue;

        const existing = domainService.list().find(d => d.domain === domainName.toLowerCase());
        if (existing) {
          skipped.push(domainName);
          continue;
        }
        domainService.create({
          domain: domainName,
          dcdn_enabled: true,
          auto_renew: false
        });
        imported.push(domainName);
      }

      if (imported.length > 0) {
        auditLogger.log({
          action: 'domain_import',
          targetType: 'domain',
          targetId: 0,
          details: { imported, skipped },
          status: 'success'
        });
        sseController.broadcast({ type: 'domain_updated', data: {} });
      }

      return { success: true, imported, skipped };
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Import failed' };
    }
  }, { body: t.Object({ domains: t.Union([t.Array(t.String()), t.String()]) }) })

  .post('/batch/check', async ({ body }) => {
    const ids = Array.isArray(body.domain_ids) ? body.domain_ids : [body.domain_ids];
    for (const id of ids) {
      const domain = domainService.get(parseInt(id));
      if (domain) certMonitor.checkDomain(domain.domain).catch(console.error);
    }
    return { success: true, count: ids.length };
  }, { body: t.Object({ domain_ids: t.Union([t.Array(t.String()), t.String()]) }) })

  .delete('/batch', async ({ body }) => {
    const ids = Array.isArray(body.domain_ids) ? body.domain_ids : [body.domain_ids];
    for (const id of ids) { try { domainService.delete(parseInt(id)); } catch {} }
    sseController.broadcast({ type: 'domain_updated', data: {} });
    return new Response(renderDomainsTable(domainService.list()), { headers: { 'Content-Type': 'text/html' } });
  }, { body: t.Object({ domain_ids: t.Union([t.Array(t.String()), t.String()]) }) });
