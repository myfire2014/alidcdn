import { Html } from '@elysiajs/html';

interface BaseLayoutProps {
  title?: string;
  children: JSX.Element | JSX.Element[];
}

export function BaseLayout({ title = '证书管理面板', children }: BaseLayoutProps) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
        <style>{`
          [hx-indicator] .htmx-indicator { display: none; }
          [hx-indicator].htmx-request .htmx-indicator { display: inline-block; }
          .htmx-request.htmx-indicator { display: inline-block; }
        `}</style>
      </head>
      <body class="bg-gray-50 min-h-screen" hx-ext="sse">
        <nav class="bg-white shadow-sm border-b">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
              <div class="flex items-center">
                <a href="/" class="text-xl font-bold text-indigo-600">🔐 证书管理</a>
              </div>
              <div class="flex items-center space-x-4">
                <a href="/" class="px-3 py-2 text-gray-600 hover:text-indigo-600 transition-colors">仪表盘</a>
                <a href="/domains" class="px-3 py-2 text-gray-600 hover:text-indigo-600 transition-colors">域名管理</a>
                <a href="/settings" class="px-3 py-2 text-gray-600 hover:text-indigo-600 transition-colors">设置</a>
                <a href="/logs" class="px-3 py-2 text-gray-600 hover:text-indigo-600 transition-colors">日志</a>
              </div>
            </div>
          </div>
        </nav>
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
