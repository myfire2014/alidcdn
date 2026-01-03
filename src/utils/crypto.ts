/**
 * AES-256-GCM encryption utilities for secure credential storage
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // bits

// Get encryption key from environment variable
export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return key;
}

// Derive a CryptoKey from the string key
async function deriveKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString.slice(0, 32)); // Use first 32 bytes
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate a random IV
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @param keyString - Optional custom key (defaults to ENCRYPTION_KEY env var)
 * @returns Base64 encoded string containing IV + ciphertext + auth tag
 */
export async function encrypt(plaintext: string, keyString?: string): Promise<string> {
  const key = await deriveKey(keyString || getEncryptionKey());
  const iv = generateIV();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource, tagLength: TAG_LENGTH },
    key,
    data
  );
  
  // Combine IV + encrypted data (which includes auth tag)
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a ciphertext string using AES-256-GCM
 * @param ciphertext - Base64 encoded string containing IV + ciphertext + auth tag
 * @param keyString - Optional custom key (defaults to ENCRYPTION_KEY env var)
 * @returns Decrypted plaintext string
 */
export async function decrypt(ciphertext: string, keyString?: string): Promise<string> {
  const key = await deriveKey(keyString || getEncryptionKey());
  
  // Decode from base64
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource, tagLength: TAG_LENGTH },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Check if encryption key is configured
 */
export function isEncryptionKeyConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
