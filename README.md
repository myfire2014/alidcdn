# 域名证书管理面板

基于 Bun + Elysia + JSX (SSR) + HTMX 的轻量级 SSL 证书管理面板。

## 功能特性

- 域名证书监控：定时检测 SSL 证书有效期
- 证书过期预警：即将过期时自动触发更新
- 泛域名/多域名证书：一个条目可填写多个域名（支持 `*.example.com` 泛域名），签发在同一张 Let's Encrypt 证书（SAN 证书）
- Cloudflare 集成：通过 DNS-01 验证自动申请证书（泛域名必需），自动按域名匹配 Zone 并校验 DNS 传播
- 阿里云 DCDN 同步：签发后自动/一键把证书上传到所有相关联的 DCDN 域名
- 实时更新：SSE 推送任务状态
- 凭证与证书本地存储：API 凭证和已签发的证书/私钥保存在本地 SQLite（明文，请确保部署环境安全）

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

1. 在设置页面配置 Cloudflare 凭证（邮箱 + Global API Key）——证书 DNS 必须托管在 Cloudflare
2. 配置阿里云 AccessKey（用于 DCDN 同步）
3. 调整证书检测调度时间（默认每天 0:00）

## 泛域名 / 多域名证书

添加域名时在"附加域名 (SAN)"中填写多个域名（每行一个，支持泛域名），例如：

```
主域名: *.239g.com
附加域名:
*.fmhyw.com
*.juluwb.com
*.shaokeng.com
239g.com
fmhyw.com
juluwb.com
shaokeng.com
```

- 8 个域名会签发在**同一张** Let's Encrypt 证书中（泛域名走 DNS-01 验证，自动在对应 Cloudflare Zone 创建 `_acme-challenge` TXT 记录并校验传播）
- 签发后若开启"自动同步到 DCDN"，会把证书上传到**所有相关联**的 DCDN 域名（精确匹配 + 泛域名覆盖的单级子域）
- 也可在列表页点"同步"打开选择弹窗，勾选要上传的 DCDN 域名后一键上传（无需重新签发）

## API 端点

- `GET /api/health` - 健康检查
- `GET /api/domains/list` - 域名列表
- `POST /api/domains` - 添加域名（`alt_domains` 为多域名/泛域名列表）
- `POST /api/domains/:id/check` - 检测证书（含 SAN 覆盖校验）
- `GET /api/domains/:id/update-cert/stream` - SSE 实时更新证书
- `GET /api/domains/:id/dcdn-matches` - 查询证书相关联的 DCDN 域名
- `POST /api/domains/:id/sync-dcdn` - 同步已签发证书到 DCDN（`domains` 为空则同步全部匹配域名）
- `GET /events` - SSE 事件流

## 技术栈

- 运行时：Bun
- 框架：Elysia
- 前端：JSX SSR + HTMX + Tailwind CSS
- 数据库：bun:sqlite
- 定时任务：croner
