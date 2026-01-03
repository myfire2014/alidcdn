import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { DashboardPage } from '../views/pages/dashboard';
import { DomainsListPage } from '../views/pages/domains/list';
import { DomainDetailPage } from '../views/pages/domains/detail';
import { DomainFormModal } from '../views/pages/domains/form';
import { SettingsPage } from '../views/pages/settings';
import { LogsPage } from '../views/pages/logs';
import { domainService } from '../services/domain-service';
import { auditLogger } from '../services/audit-logger';
import { scheduler } from '../services/scheduler';
import { credentialStore } from '../services/credential-store';

export const pagesRoute = new Elysia()
  .use(html())
  
  // Dashboard
  .get('/', () => {
    const domains = domainService.list();
    const recentLogs = auditLogger.getRecent(5);
    const schedulerStatus = scheduler.getStatus();

    return (
      <DashboardPage 
        domains={domains} 
        recentLogs={recentLogs} 
        schedulerStatus={schedulerStatus} 
      />
    );
  })

  // Domains list
  .get('/domains', () => {
    const domains = domainService.list();
    return <DomainsListPage domains={domains} />;
  })

  // New domain form (modal) - must be before /domains/:id
  .get('/domains/new', () => {
    return <DomainFormModal />;
  })

  // Domain detail
  .get('/domains/:id', ({ params }) => {
    const domain = domainService.get(parseInt(params.id));
    if (!domain) {
      return new Response('Domain not found', { status: 404 });
    }

    const logs = auditLogger.query({
      targetType: 'domain',
      targetId: domain.id,
      pageSize: 20
    }).logs;

    return <DomainDetailPage domain={domain} logs={logs} />;
  }, {
    params: t.Object({ id: t.String() })
  })

  // Settings page
  .get('/settings', ({ query }) => {
    const cloudflareConfigured = credentialStore.hasCredential('cloudflare', 'email') && 
                                  credentialStore.hasCredential('cloudflare', 'api_key');
    const aliyunConfigured = credentialStore.hasCredential('aliyun', 'access_key_id') && 
                              credentialStore.hasCredential('aliyun', 'access_key_secret');

    const schedulerConfig = scheduler.getConfig('cert_check');

    const maskedCloudflareEmail = credentialStore.getMaskedCredential('cloudflare', 'email');
    const maskedCloudflareKey = credentialStore.getMaskedCredential('cloudflare', 'api_key');
    const maskedAliyunKeyId = credentialStore.getMaskedCredential('aliyun', 'access_key_id');
    const maskedAliyunKeySecret = credentialStore.getMaskedCredential('aliyun', 'access_key_secret');

    return (
      <SettingsPage
        cloudflareConfigured={cloudflareConfigured}
        aliyunConfigured={aliyunConfigured}
        maskedCloudflareEmail={maskedCloudflareEmail ?? undefined}
        maskedCloudflareKey={maskedCloudflareKey ?? undefined}
        maskedAliyunKeyId={maskedAliyunKeyId ?? undefined}
        maskedAliyunKeySecret={maskedAliyunKeySecret ?? undefined}
        schedulerConfig={schedulerConfig}
        message={query.message ? { type: (query.type as 'success' | 'error') || 'success', text: query.message } : undefined}
      />
    );
  }, {
    query: t.Object({
      message: t.Optional(t.String()),
      type: t.Optional(t.String())
    })
  })

  // Logs page
  .get('/logs', ({ query }) => {
    const page = parseInt(query.page || '1');
    const pageSize = 20;

    const result = auditLogger.query({
      action: query.action || undefined,
      status: (query.status as 'success' | 'failure') || undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      pageSize
    });

    return (
      <LogsPage
        logs={result.logs}
        total={result.total}
        page={page}
        pageSize={pageSize}
        filters={{
          action: query.action,
          status: query.status,
          startDate: query.startDate,
          endDate: query.endDate
        }}
      />
    );
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      action: t.Optional(t.String()),
      status: t.Optional(t.String()),
      startDate: t.Optional(t.String()),
      endDate: t.Optional(t.String())
    })
  });
