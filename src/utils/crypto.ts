/**
 * Simple credential storage utilities (no encryption for local use)
 */

/**
 * Store value as-is (no encryption)
 */
export async function encrypt(plaintext: string): Promise<string> {
  return plaintext;
}

/**
 * Return value as-is (no decryption)
 */
export async function decrypt(ciphertext: string): Promise<string> {
  return ciphertext;
}

/**
 * Always return true since no encryption key is needed
 */
export function isEncryptionKeyConfigured(): boolean {
  return true;
}
