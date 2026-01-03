import { Html } from '@elysiajs/html';
import { BaseLayout } from '../layouts/base';
import { Card, Button, Alert } from '../components/ui';
import type { SchedulerConfig } from '../../types';

interface SettingsProps {
  cloudflareConfigured: boolean;
  aliyunConfigured: boolean;
  maskedCloudflareEmail?: string;
  maskedCloudflareKey?: string;
  maskedAliyunKeyId?: string;
  maskedAliyunKeySecret?: string;
  schedulerConfig: SchedulerConfig | null;
  message?: { type: 'success' | 'error'; text: string };
}

export function SettingsPage({
  cloudflareConfigured,
  aliyunConfigured,
  maskedCloudflareEmail,
  maskedCloudflareKey,
  maskedAliyunKeyId,
  maskedAliyunKeySecret,
  schedulerConfig,
  message
}: SettingsProps) {
  return (
    <BaseLayout title="设置 - 证书管理">
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-gray-900">设置</h1>

        {message && <Alert type={message.type} message={message.text} dismissible />}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cloudflare Settings */}
          <Card title="Cloudflare 配置">
            <form hx-post="/api/settings/cloudflare" hx-swap="none" class="space-y-4">
              <div class="flex items-center gap-2 mb-4">
                <span class={`w-3 h-3 rounded-full ${cloudflareConfigured ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span class="text-sm text-gray-600">
                  {cloudflareConfigured ? '已配置' : '未配置'}
                </span>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  name="email"
                  placeholder={maskedCloudflareEmail || 'your@email.com'}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p class="mt-1 text-xs text-gray-500">Cloudflare 账户邮箱</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Global API Key</label>
                <input
                  type="password"
                  name="apiKey"
                  placeholder={maskedCloudflareKey || '输入 API Key'}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p class="mt-1 text-xs text-gray-500">
                  在 Cloudflare 控制台 → My Profile → API Tokens 获取
                </p>
              </div>

              <Button type="submit" class="w-full">保存 Cloudflare 配置</Button>
            </form>
          </Card>

          {/* Aliyun Settings */}
          <Card title="阿里云 DCDN 配置">
            <form hx-post="/api/settings/aliyun" hx-swap="none" class="space-y-4">
              <div class="flex items-center gap-2 mb-4">
                <span class={`w-3 h-3 rounded-full ${aliyunConfigured ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span class="text-sm text-gray-600">
                  {aliyunConfigured ? '已配置' : '未配置'}
                </span>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">AccessKey ID</label>
                <input
                  type="text"
                  name="accessKeyId"
                  placeholder={maskedAliyunKeyId || '输入 AccessKey ID'}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">AccessKey Secret</label>
                <input
                  type="password"
                  name="accessKeySecret"
                  placeholder={maskedAliyunKeySecret || '输入 AccessKey Secret'}
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p class="mt-1 text-xs text-gray-500">
                  在阿里云控制台 → AccessKey 管理获取
                </p>
              </div>

              <Button type="submit" class="w-full">保存阿里云配置</Button>
            </form>
          </Card>
        </div>

        {/* Scheduler Settings */}
        <Card title="调度配置">
          <form hx-post="/api/settings/scheduler" hx-swap="none" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Cron 表达式</label>
                <input
                  type="text"
                  name="cronExpression"
                  value={schedulerConfig?.cron_expression || '0 0 * * *'}
                  placeholder="0 0 * * *"
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p class="mt-1 text-xs text-gray-500">默认每天 0:00 执行检测</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <div class="flex items-center h-[42px]">
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="enabled"
                      checked={schedulerConfig?.enabled ?? true}
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    <span class="ml-3 text-sm text-gray-700">启用自动检测</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2">常用 Cron 表达式</h4>
              <ul class="text-sm text-gray-600 space-y-1">
                <li><code class="bg-gray-200 px-1 rounded">0 0 * * *</code> - 每天 0:00</li>
                <li><code class="bg-gray-200 px-1 rounded">0 */6 * * *</code> - 每 6 小时</li>
                <li><code class="bg-gray-200 px-1 rounded">0 0 * * 0</code> - 每周日 0:00</li>
                <li><code class="bg-gray-200 px-1 rounded">0 0 1 * *</code> - 每月 1 日 0:00</li>
              </ul>
            </div>

            <Button type="submit" class="w-full">保存调度配置</Button>
          </form>
        </Card>

        {/* System Info */}
        <Card title="系统信息">
          <dl class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt class="text-gray-500">运行环境</dt>
              <dd class="font-medium">Bun + Elysia</dd>
            </div>
            <div>
              <dt class="text-gray-500">数据库</dt>
              <dd class="font-medium">SQLite (bun:sqlite)</dd>
            </div>
          </dl>
        </Card>
      </div>
    </BaseLayout>
  );
}
