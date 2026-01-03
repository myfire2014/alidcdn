# 域名证书管理面板

基于 Bun + Elysia + JSX (SSR) + HTMX 的轻量级 SSL 证书管理面板。

## 功能特性

- 域名证书监控：定时检测 SSL 证书有效期
- 证书过期预警：即将过期时自动触发更新
- Cloudflare 集成：通过 API 自动更新 Let's Encrypt 证书
- 阿里云 DCDN 同步：同步证书到全站加速
- 实时更新：SSE 推送任务状态
- 加密存储：AES-256-GCM 加密 API 凭证

## 快速开始

```bash
# 安装依赖
bun install

# 设置加密密钥（必须 32 字符）
export ENCRYPTION_KEY="your-32-character-encryption-key!"

# 启动开发服务器
bun run dev

# 运行测试
bun test
```

访问 http://localhost:3000 打开管理面板。

## 配置

1. 在设置页面配置 Cloudflare 凭证（邮箱 + Global API Key）
2. 配置阿里云 AccessKey（用于 DCDN 同步）
3. 调整证书检测调度时间（默认每天 0:00）

## API 端点

- `GET /api/health` - 健康检查
- `GET /api/domains/list` - 域名列表
- `POST /api/domains` - 添加域名
- `POST /api/domains/:id/check` - 检测证书
- `POST /api/domains/:id/update-cert` - 更新证书
- `GET /events` - SSE 事件流

## 技术栈

- 运行时：Bun
- 框架：Elysia
- 前端：JSX SSR + HTMX + Tailwind CSS
- 数据库：bun:sqlite
- 定时任务：croner
