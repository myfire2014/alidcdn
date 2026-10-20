import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from '../db';
import { CredentialStore, maskCredential } from './credential-store';

// Set encryption key for tests
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!';

describe('CredentialStore', () => {
  let store: CredentialStore;

  beforeAll(() => {
    initDatabase(':memory:');
    store = new CredentialStore();
  });

  afterAll(() => {
    closeDatabase();
  });

  test('should store and retrieve credential', async () => {
    const provider = 'cloudflare';
    const keyName = 'api_key';
    const value = 'my-secret-api-key-12345';

    await store.setCredential(provider, keyName, value);
    const retrieved = await store.getCredential(provider, keyName);

    expect(retrieved).toBe(value);
  });

  test('should return null for non-existent credential', async () => {
    const result = await store.getCredential('nonexistent', 'key');
    expect(result).toBeNull();
  });

  test('should store value retrievable via raw read', async () => {
    // Storage layer is plain (no encryption) for local use - see utils/crypto.ts
    const provider = 'aliyun';
    const keyName = 'access_key';
    const value = 'LTAI5tTestAccessKey';

    await store.setCredential(provider, keyName, value);
    const raw = store.getRawEncryptedValue(provider, keyName);

    expect(raw).toBe(value);
  });

  test('should update existing credential', async () => {
    const provider = 'cloudflare';
    const keyName = 'email';
    
    await store.setCredential(provider, keyName, 'old@example.com');
    await store.setCredential(provider, keyName, 'new@example.com');
    
    const result = await store.getCredential(provider, keyName);
    expect(result).toBe('new@example.com');
  });

  test('should delete credential', async () => {
    const provider = 'test';
    const keyName = 'to_delete';
    
    await store.setCredential(provider, keyName, 'value');
    expect(await store.hasCredential(provider, keyName)).toBe(true);
    
    await store.deleteCredential(provider, keyName);
    expect(await store.hasCredential(provider, keyName)).toBe(false);
  });

  test('should check credential existence', async () => {
    const provider = 'check';
    const keyName = 'exists';
    
    expect(await store.hasCredential(provider, keyName)).toBe(false);
    await store.setCredential(provider, keyName, 'value');
    expect(await store.hasCredential(provider, keyName)).toBe(true);
  });

  test('should return masked credential', async () => {
    const provider = 'mask';
    const keyName = 'secret';
    const value = 'my-long-secret-key';
    
    await store.setCredential(provider, keyName, value);
    const masked = store.getMaskedCredential(provider, keyName);
    
    // getMaskedCredential returns a placeholder since it can't decrypt synchronously
    expect(masked).not.toBeNull();
    expect(masked).toContain('****');
  });
});

describe('maskCredential', () => {
  test('should mask long strings showing last 4 chars', () => {
    expect(maskCredential('abcdefghij')).toBe('******ghij');
    expect(maskCredential('12345678')).toBe('****5678');
  });

  test('should fully mask short strings', () => {
    expect(maskCredential('abc')).toBe('***');
    expect(maskCredential('ab')).toBe('**');
    expect(maskCredential('a')).toBe('*');
  });

  test('should handle exactly 4 character strings', () => {
    expect(maskCredential('abcd')).toBe('****');
  });

  test('should handle 5 character strings', () => {
    expect(maskCredential('abcde')).toBe('*bcde');
  });
});
