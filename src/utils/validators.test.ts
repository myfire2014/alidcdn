import { describe, test, expect } from 'bun:test';
import {
  validateDomain,
  isWildcardDomain,
  getBaseDomain,
  parseDomainList,
  certCoversName,
  normalizeDomain,
  MAX_CERT_NAMES
} from './validators';

describe('validateDomain (泛域名支持)', () => {
  test('accepts regular domains', () => {
    expect(validateDomain('example.com').valid).toBe(true);
    expect(validateDomain('sub.example.com').valid).toBe(true);
  });

  test('accepts wildcard domains', () => {
    expect(validateDomain('*.example.com').valid).toBe(true);
    expect(validateDomain('*.sub.example.com').valid).toBe(true);
  });

  test('rejects invalid wildcard forms', () => {
    expect(validateDomain('*.').valid).toBe(false);
    expect(validateDomain('*').valid).toBe(false);
    expect(validateDomain('a.*.example.com').valid).toBe(false);
    expect(validateDomain('*.example.*').valid).toBe(false);
    expect(validateDomain('foo.*.example.com').valid).toBe(false);
  });

  test('still rejects malformed domains', () => {
    expect(validateDomain('').valid).toBe(false);
    expect(validateDomain('invalid domain').valid).toBe(false);
    expect(validateDomain('a..b.com').valid).toBe(false);
    expect(validateDomain('.example.com').valid).toBe(false);
    expect(validateDomain('example.com.').valid).toBe(false);
  });
});

describe('isWildcardDomain / getBaseDomain', () => {
  test('detects wildcards', () => {
    expect(isWildcardDomain('*.example.com')).toBe(true);
    expect(isWildcardDomain('example.com')).toBe(false);
  });

  test('strips wildcard prefix', () => {
    expect(getBaseDomain('*.example.com')).toBe('example.com');
    expect(getBaseDomain('example.com')).toBe('example.com');
    expect(getBaseDomain('*.sub.example.com')).toBe('sub.example.com');
  });
});

describe('parseDomainList (多域名解析)', () => {
  test('parses newline separated list', () => {
    const result = parseDomainList('*.239g.com\n*.fmhyw.com\n239g.com');
    expect(result.valid).toBe(true);
    expect(result.domains).toEqual(['*.239g.com', '*.fmhyw.com', '239g.com']);
  });

  test('parses comma separated list', () => {
    const result = parseDomainList('a.com, b.com; c.com');
    expect(result.valid).toBe(true);
    expect(result.domains).toEqual(['a.com', 'b.com', 'c.com']);
  });

  test('normalizes and dedupes', () => {
    const result = parseDomainList('EXAMPLE.com\n*.Example.COM\nexample.com');
    expect(result.valid).toBe(true);
    expect(result.domains).toEqual(['example.com', '*.example.com']);
  });

  test('rejects list containing an invalid entry', () => {
    const result = parseDomainList('a.com\nbad domain\nb.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('bad domain');
  });

  test('enforces max names', () => {
    const many = Array.from({ length: MAX_CERT_NAMES + 1 }, (_, i) => `d${i}.com`).join(',');
    const result = parseDomainList(many);
    expect(result.valid).toBe(false);
  });

  test('empty input yields empty list', () => {
    expect(parseDomainList('').valid).toBe(true);
    expect(parseDomainList('  ').domains).toEqual([]);
  });
});

describe('certCoversName (证书覆盖匹配)', () => {
  const names = ['*.239g.com', '*.fmhyw.com', '239g.com', 'fmhyw.com'];

  test('exact match covers', () => {
    expect(certCoversName(names, '239g.com')).toBe(true);
    expect(certCoversName(names, '*.239g.com')).toBe(true);
  });

  test('wildcard covers single-level subdomains', () => {
    expect(certCoversName(names, 'www.239g.com')).toBe(true);
    expect(certCoversName(names, 'cdn.fmhyw.com')).toBe(true);
  });

  test('wildcard does not cover apex or deeper levels', () => {
    expect(certCoversName(['*.239g.com'], '239g.com')).toBe(false);
    expect(certCoversName(['*.239g.com'], 'a.b.239g.com')).toBe(false);
    expect(certCoversName(['*.239g.com'], '*.sub.239g.com')).toBe(false);
  });

  test('unrelated domains are not covered', () => {
    expect(certCoversName(names, 'juluwb.com')).toBe(false);
    expect(certCoversName(names, '*.juluwb.com')).toBe(false);
    expect(certCoversName(names, 'evil-239g.com')).toBe(false);
  });

  test('normalizes case', () => {
    expect(certCoversName(['*.Example.COM'], 'www.example.com')).toBe(true);
  });
});

describe('normalizeDomain', () => {
  test('lowercases and trims', () => {
    expect(normalizeDomain('  *.Example.COM ')).toBe('*.example.com');
  });
});
