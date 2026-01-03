import { Html } from '@elysiajs/html';
import { Button, Alert } from '../../components/ui';
import type { Domain } from '../../../types';

interface DomainFormProps {
  domain?: Domain;
  error?: string;
}

export function DomainFormModal({ domain, error }: DomainFormProps) {
  const isEdit = !!domain;
  
  return (
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target === this) this.remove()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onclick="event.stopPropagation()">
        <div class="flex justify-between items-center p-6 border-b">
          <h2 class="text-xl font-semibold">{isEdit ? '编辑域名' : '添加域名'}</h2>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        
        <form
          hx-post={isEdit ? `/api/domains/${domain.id}` : '/api/domains'}
          hx-target="#domains-table"
          hx-swap="innerHTML"
          class="p-6 space-y-4"
        >
          {error && <Alert type="error" message={error} />}
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">域名</label>
            <input
              type="text"
              name="domain"
              value={domain?.domain || ''}
              placeholder="example.com"
              required
              pattern="^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isEdit}
            />
            <p class="mt-1 text-sm text-gray-500">输入要监控的域名，如 example.com</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">备注（可选）</label>
            <input
              type="text"
              name="notes"
              value={domain?.notes || ''}
              placeholder="添加备注信息"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div class="flex items-center">
            <input
              type="checkbox"
              name="auto_renew"
              id="auto_renew"
              checked={domain?.auto_renew ?? true}
              class="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label for="auto_renew" class="ml-2 text-sm text-gray-700">启用自动续期</label>
          </div>

          <div class="flex items-center">
            <input
              type="checkbox"
              name="dcdn_enabled"
              id="dcdn_enabled"
              checked={domain?.dcdn_enabled ?? false}
              class="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label for="dcdn_enabled" class="ml-2 text-sm text-gray-700">启用 DCDN 同步</label>
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onclick="this.closest('.fixed').remove()">
              取消
            </Button>
            <Button type="submit">
              {isEdit ? '保存' : '添加'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
