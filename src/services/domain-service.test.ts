import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { initDatabase, closeDatabase, getDatabase } from '../db';
import { DomainService } from './domain-service';

describe('DomainService', () => {
  let service: DomainService;

  beforeAll(() => {
    initDatabase(':memory:');
    service = new DomainService();
  });

  afterAll(() => {
    closeDatabase();
  });

  beforeEach(() => {
    // Clean up domains table before each test
    const db = getDatabase();
    db.run('DELETE FROM certificate_status');
    db.run('DELETE FROM domains');
  });

  test('should create a domain', () => {
    const result = service.create({ domain: 'example.com' });
    
    expect(result.domain).toBe('example.com');
    expect(result.id).toBeGreaterThan(0);
    expect(result.cert_status).toBeNull();
  });

  test('should normalize domain to lowercase', () => {
    const result = service.create({ domain: 'EXAMPLE.COM' });
    expect(result.domain).toBe('example.com');
  });

  test('should reject invalid domain', () => {
    expect(() => service.create({ domain: '' })).toThrow('Domain cannot be empty');
    expect(() => service.create({ domain: '   ' })).toThrow('Domain cannot be whitespace');
    expect(() => service.create({ domain: 'invalid domain' })).toThrow();
  });

  test('should reject duplicate domain', () => {
    service.create({ domain: 'unique.com' });
    expect(() => service.create({ domain: 'unique.com' })).toThrow('Domain already exists');
  });

  test('should list all domains', () => {
    service.create({ domain: 'a.com' });
    service.create({ domain: 'b.com' });
    service.create({ domain: 'c.com' });

    const list = service.list();
    expect(list.length).toBe(3);
  });

  test('should get domain by id', () => {
    const created = service.create({ domain: 'get-test.com' });
    const retrieved = service.get(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.domain).toBe('get-test.com');
  });

  test('should return null for non-existent domain', () => {
    const result = service.get(99999);
    expect(result).toBeNull();
  });

  test('should update domain', () => {
    const created = service.create({ domain: 'update-test.com' });
    const updated = service.update(created.id, { description: 'Updated description' });

    expect(updated.description).toBe('Updated description');
  });

  test('should delete domain', () => {
    const created = service.create({ domain: 'delete-test.com' });
    service.delete(created.id);

    const result = service.get(created.id);
    expect(result).toBeNull();
  });

  test('should throw when deleting non-existent domain', () => {
    expect(() => service.delete(99999)).toThrow('Domain not found');
  });

  test('should update certificate status', () => {
    const created = service.create({ domain: 'cert-test.com' });
    
    service.updateCertStatus(created.id, {
      status: 'valid',
      issuer: 'Let\'s Encrypt',
      validFrom: '2024-01-01',
      validTo: '2024-04-01',
      daysRemaining: 90
    });

    const retrieved = service.get(created.id);
    expect(retrieved!.cert_status).not.toBeNull();
    expect(retrieved!.cert_status!.status).toBe('valid');
    expect(retrieved!.cert_status!.issuer).toBe('Let\'s Encrypt');
  });

  test('should get status counts', () => {
    service.create({ domain: 'valid1.com' });
    service.create({ domain: 'valid2.com' });
    service.create({ domain: 'expiring.com' });

    const domains = service.list();
    service.updateCertStatus(domains[0].id, { status: 'valid' });
    service.updateCertStatus(domains[1].id, { status: 'valid' });
    service.updateCertStatus(domains[2].id, { status: 'expiring' });

    const counts = service.getStatusCounts();
    expect(counts.total).toBe(3);
    expect(counts.valid).toBe(2);
    expect(counts.expiring).toBe(1);
  });

  test('should get domain by domain name', () => {
    service.create({ domain: 'byname.com' });
    const result = service.getByDomain('byname.com');

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('byname.com');
  });
});
