import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { initDatabase, closeDatabase, getDatabase } from '../db';
import { AuditLogger, logCertCheck, logCertUpdate } from './audit-logger';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeAll(() => {
    initDatabase(':memory:');
    logger = new AuditLogger();
  });

  afterAll(() => {
    closeDatabase();
  });

  beforeEach(() => {
    const db = getDatabase();
    db.run('DELETE FROM audit_logs');
  });

  test('should log an entry', () => {
    logger.log({
      action: 'test_action',
      targetType: 'test',
      targetId: 1,
      details: { key: 'value' },
      status: 'success'
    });

    const logs = logger.query();
    expect(logs.logs.length).toBe(1);
    expect(logs.logs[0].action).toBe('test_action');
    expect(logs.logs[0].status).toBe('success');
  });

  test('should query with filters', () => {
    logger.log({ action: 'action1', targetType: 'type1', details: {}, status: 'success' });
    logger.log({ action: 'action2', targetType: 'type1', details: {}, status: 'failure' });
    logger.log({ action: 'action1', targetType: 'type2', details: {}, status: 'success' });

    const byAction = logger.query({ action: 'action1' });
    expect(byAction.logs.length).toBe(2);

    const byStatus = logger.query({ status: 'failure' });
    expect(byStatus.logs.length).toBe(1);

    const byType = logger.query({ targetType: 'type2' });
    expect(byType.logs.length).toBe(1);
  });

  test('should paginate results', () => {
    for (let i = 0; i < 25; i++) {
      logger.log({ action: `action${i}`, targetType: 'test', details: {}, status: 'success' });
    }

    const page1 = logger.query({ page: 1, pageSize: 10 });
    expect(page1.logs.length).toBe(10);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);

    const page2 = logger.query({ page: 2, pageSize: 10 });
    expect(page2.logs.length).toBe(10);

    const page3 = logger.query({ page: 3, pageSize: 10 });
    expect(page3.logs.length).toBe(5);
  });

  test('should get recent logs', () => {
    for (let i = 0; i < 15; i++) {
      logger.log({ action: `action${i}`, targetType: 'test', details: {}, status: 'success' });
    }

    const recent = logger.getRecent(5);
    expect(recent.length).toBe(5);
  });

  test('should cleanup old logs', () => {
    const db = getDatabase();
    
    // Insert old log directly
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    db.run(`
      INSERT INTO audit_logs (action, target_type, details, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, ['old_action', 'test', '{}', 'success', oldDate.toISOString()]);

    // Insert recent log
    logger.log({ action: 'recent_action', targetType: 'test', details: {}, status: 'success' });

    const beforeCleanup = logger.query();
    expect(beforeCleanup.total).toBe(2);

    const deleted = logger.cleanup(90);
    expect(deleted).toBe(1);

    const afterCleanup = logger.query();
    expect(afterCleanup.total).toBe(1);
    expect(afterCleanup.logs[0].action).toBe('recent_action');
  });

  test('should filter by date range', () => {
    const db = getDatabase();
    
    // Insert logs with different dates
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    db.run(`
      INSERT INTO audit_logs (action, target_type, details, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, ['yesterday', 'test', '{}', 'success', yesterday.toISOString()]);

    db.run(`
      INSERT INTO audit_logs (action, target_type, details, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, ['two_days_ago', 'test', '{}', 'success', twoDaysAgo.toISOString()]);

    logger.log({ action: 'today', targetType: 'test', details: {}, status: 'success' });

    const filtered = logger.query({ startDate: yesterday });
    expect(filtered.logs.length).toBe(2);
  });
});

describe('Convenience log functions', () => {
  let logger: AuditLogger;

  beforeAll(() => {
    initDatabase(':memory:');
    logger = new AuditLogger();
  });

  afterAll(() => {
    closeDatabase();
  });

  beforeEach(() => {
    const db = getDatabase();
    db.run('DELETE FROM audit_logs');
  });

  test('logCertCheck should create correct log entry', () => {
    logCertCheck(1, 'example.com', 'success', { daysRemaining: 30 });

    const logs = logger.query();
    expect(logs.logs.length).toBe(1);
    expect(logs.logs[0].action).toBe('cert_check');
    expect(logs.logs[0].target_type).toBe('domain');
    expect(logs.logs[0].target_id).toBe(1);
  });

  test('logCertUpdate should create correct log entry', () => {
    logCertUpdate(2, 'test.com', 'failure', { error: 'API error' });

    const logs = logger.query();
    expect(logs.logs.length).toBe(1);
    expect(logs.logs[0].action).toBe('cert_update');
    expect(logs.logs[0].status).toBe('failure');
  });
});
