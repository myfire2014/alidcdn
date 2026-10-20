/**
 * CLI: 为某个域名条目签发(续期)证书并同步到 DCDN
 *
 * Usage:
 *   bun scripts/issue-cert.ts <domain>     # 按域名查找条目
 *   DB_PATH=data/cert-manager.db bun scripts/issue-cert.ts *.example.com
 */
import { initDatabase } from '../src/db';
import { domainService } from '../src/services/domain-service';
import { certUpdater } from '../src/services/cert-updater';
import { dcdnSyncer } from '../src/services/dcdn-syncer';

const domainName = process.argv[2];
if (!domainName) {
  console.error('Usage: bun scripts/issue-cert.ts <domain>');
  process.exit(1);
}

initDatabase(process.env.DB_PATH || 'data/cert-manager.db');

const entry = domainService.getByDomain(domainName);
if (!entry) {
  console.error(`Domain not found: ${domainName}`);
  process.exit(1);
}

console.log(`== 开始为 ${entry.domain} 签发证书 (共 ${[entry.domain, ...(entry.alt_domains || [])].length} 个域名) ==`);

const result = await certUpdater.updateCertificate(entry.id, (step, message, progress) => {
  console.log(`[${String(progress).padStart(3)}%] [${step}] ${message}`);
});

if (!result.success) {
  console.error(`\n== 签发失败 ==\n${result.message}`);
  process.exit(1);
}

console.log(`\n== 签发成功 ==`);
console.log(`覆盖域名: ${(result.names || []).join(', ')}`);
console.log(`有效期至: ${result.expiresOn}`);

if (result.dcdnResult) {
  console.log(`\n== DCDN 同步 ${result.dcdnResult.success ? '成功' : '部分失败'} ==`);
  console.log(result.dcdnResult.message);
  for (const item of result.dcdnResult.results || []) {
    console.log(`  ${item.success ? '✓' : '✗'} ${item.domainName}${item.error ? ' - ' + item.error : ''}`);
  }
}

// Verify a few DCDN domains picked up the new cert
const matched = await dcdnSyncer.getMatchingDCDNDomains(entry.id).catch(() => []);
if (matched.length > 0) {
  console.log(`\n== DCDN 侧证书状态抽查 ==`);
  for (const d of matched.slice(0, 3)) {
    const status = await dcdnSyncer.getDCDNCertStatus(d.domainName).catch(() => null);
    if (status) {
      console.log(`  ${d.domainName}: cert=${status.certName}, expire=${status.certExpireTime}`);
    }
  }
}
