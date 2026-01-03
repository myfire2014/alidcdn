/**
 * Aliyun API signature utilities
 * Implements the Aliyun API signature algorithm (Version 1.0)
 */

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Percent encode a string according to RFC 3986
 */
export function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * Sort parameters and create query string
 */
export function sortedQueryString(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys
    .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
}

/**
 * Create string to sign
 */
export function createStringToSign(method: string, queryString: string): string {
  return `${method}&${percentEncode('/')}&${percentEncode(queryString)}`;
}

/**
 * Calculate HMAC-SHA1 signature
 */
export async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key + '&'); // Aliyun requires trailing &
  const dataBuffer = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Sign Aliyun API request
 */
export async function signRequest(
  accessKeyId: string,
  accessKeySecret: string,
  params: Record<string, string>
): Promise<Record<string, string>> {
  // Add common parameters
  const allParams: Record<string, string> = {
    Format: 'JSON',
    Version: '2018-01-15', // DCDN API version
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: getTimestamp(),
    SignatureVersion: '1.0',
    SignatureNonce: generateNonce(),
    ...params
  };

  // Create string to sign
  const queryString = sortedQueryString(allParams);
  const stringToSign = createStringToSign('GET', queryString);

  // Calculate signature
  const signature = await hmacSha1(accessKeySecret, stringToSign);
  allParams.Signature = signature;

  return allParams;
}

/**
 * Build signed URL for Aliyun API
 */
export async function buildSignedUrl(
  endpoint: string,
  accessKeyId: string,
  accessKeySecret: string,
  params: Record<string, string>
): Promise<string> {
  const signedParams = await signRequest(accessKeyId, accessKeySecret, params);
  const queryString = Object.entries(signedParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  
  return `${endpoint}?${queryString}`;
}
