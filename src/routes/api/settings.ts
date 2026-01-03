import { Elysia, t } from 'elysia';
import { credentialStore } from '../../services/credential-store';
import { scheduler } from '../../services/scheduler';
import { auditLogger } from '../../services/audit-logger';

export const settingsApi = new Elysia({ prefix: '/api/settings' })
  // Save Cloudflare credentials
  .post('/cloudflare', async ({ body, set }) => {
    try {
      if (body.email) {
        await credentialStore.setCredential('cloudflare', 'email', body.email);
      }
      if (body.apiKey) {
        await credentialStore.setCredential('cloudflare', 'api_key', body.apiKey);
      }

      auditLogger.log({
        action: 'credential_update',
        targetType: 'credential',
        details: { provider: 'cloudflare' },
        status: 'success'
      });

      set.headers['HX-Trigger'] = JSON.stringify({ 
        showMessage: { type: 'success', text: 'Cloudflare 配置已保存' }
      });
      return { success: true };
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
  }, {
    body: t.Object({
      email: t.Optional(t.String()),
      apiKey: t.Optional(t.String())
    })
  })

  // Save Aliyun credentials
  .post('/aliyun', async ({ body, set }) => {
    try {
      if (body.accessKeyId) {
        await credentialStore.setCredential('aliyun', 'access_key_id', body.accessKeyId);
      }
      if (body.accessKeySecret) {
        await credentialStore.setCredential('aliyun', 'access_key_secret', body.accessKeySecret);
      }

      auditLogger.log({
        action: 'credential_update',
        targetType: 'credential',
        details: { provider: 'aliyun' },
        status: 'success'
      });

      set.headers['HX-Trigger'] = JSON.stringify({ 
        showMessage: { type: 'success', text: '阿里云配置已保存' }
      });
      return { success: true };
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
  }, {
    body: t.Object({
      accessKeyId: t.Optional(t.String()),
      accessKeySecret: t.Optional(t.String())
    })
  })

  // Save scheduler config
  .post('/scheduler', async ({ body, set }) => {
    try {
      scheduler.updateConfig('cert_check', {
        cronExpression: body.cronExpression || '0 0 * * *',
        enabled: body.enabled === 'on' || body.enabled === true
      });

      set.headers['HX-Trigger'] = JSON.stringify({ 
        showMessage: { type: 'success', text: '调度配置已保存' }
      });
      return { success: true };
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : 'Failed to save scheduler config' };
    }
  }, {
    body: t.Object({
      cronExpression: t.Optional(t.String()),
      enabled: t.Optional(t.Union([t.String(), t.Boolean()]))
    })
  });
