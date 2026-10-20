/**
 * Domain validation utilities
 */

// Maximum domain length per RFC 1035
const MAX_DOMAIN_LENGTH = 253;
// Maximum label length per RFC 1035
const MAX_LABEL_LENGTH = 63;
// Maximum SAN entries per certificate (Let's Encrypt limit)
export const MAX_CERT_NAMES = 100;

// Valid domain pattern: alphanumeric, hyphens, dots
// Each label must start and end with alphanumeric
const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63}(?<!-))*$/;

export const WILDCARD_PREFIX = '*.';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a domain is a wildcard domain (e.g. *.example.com)
 */
export function isWildcardDomain(domain: string): boolean {
  return domain.startsWith(WILDCARD_PREFIX);
}

/**
 * Get the base domain of a wildcard domain (*.example.com -> example.com)
 * Non-wildcard domains are returned unchanged
 */
export function getBaseDomain(domain: string): string {
  return isWildcardDomain(domain) ? domain.slice(WILDCARD_PREFIX.length) : domain;
}

/**
 * Validate a domain name (wildcard *.example.com is accepted)
 * @param domain - The domain string to validate
 * @returns ValidationResult with valid flag and optional error message
 */
export function validateDomain(domain: string): ValidationResult {
  // Check for null/undefined
  if (domain === null || domain === undefined) {
    return { valid: false, error: 'Domain is required' };
  }

  // Check for empty string
  if (domain.length === 0) {
    return { valid: false, error: 'Domain cannot be empty' };
  }

  // Trim and check for whitespace-only
  const trimmed = domain.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Domain cannot be whitespace only' };
  }

  // Check for whitespace in domain
  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'Domain cannot contain whitespace' };
  }

  // Validate base part (strip wildcard prefix)
  const base = getBaseDomain(trimmed);

  if (isWildcardDomain(trimmed) && base.length === 0) {
    return { valid: false, error: 'Wildcard domain must have a base domain' };
  }

  if (isWildcardDomain(trimmed) && base.includes('*')) {
    return { valid: false, error: 'Wildcard is only allowed as the leftmost label' };
  }

  // Check maximum length
  if (base.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, error: `Domain exceeds maximum length of ${MAX_DOMAIN_LENGTH}` };
  }

  // Check for invalid characters
  if (/[^a-zA-Z0-9.-]/.test(base)) {
    return { valid: false, error: 'Domain contains invalid characters' };
  }

  // Check for consecutive dots
  if (base.includes('..')) {
    return { valid: false, error: 'Domain cannot contain consecutive dots' };
  }

  // Check for leading/trailing dots
  if (base.startsWith('.') || base.endsWith('.')) {
    return { valid: false, error: 'Domain cannot start or end with a dot' };
  }

  // Check each label
  const labels = base.split('.');

  if (labels.length === 0) {
    return { valid: false, error: 'Invalid domain format' };
  }

  for (const label of labels) {
    // Check label length
    if (label.length === 0) {
      return { valid: false, error: 'Domain label cannot be empty' };
    }

    if (label.length > MAX_LABEL_LENGTH) {
      return { valid: false, error: `Domain label exceeds maximum length of ${MAX_LABEL_LENGTH}` };
    }

    // Check label doesn't start or end with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, error: 'Domain label cannot start or end with hyphen' };
    }

    // Validate label format
    if (!DOMAIN_REGEX.test(label)) {
      return { valid: false, error: `Invalid domain label: ${label}` };
    }
  }

  return { valid: true };
}

/**
 * Check if a domain is valid (simple boolean check)
 */
export function isValidDomain(domain: string): boolean {
  return validateDomain(domain).valid;
}

/**
 * Normalize a domain name (lowercase, trim)
 */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/**
 * Parse a multi-domain input string (separated by newlines, commas or spaces)
 * into a normalized, validated, de-duplicated domain list.
 * Wildcard domains such as *.example.com are accepted.
 */
export function parseDomainList(input: string, options: { maxNames?: number } = {}): {
  valid: boolean;
  domains: string[];
  error?: string;
} {
  const maxNames = options.maxNames ?? MAX_CERT_NAMES;

  if (!input || !input.trim()) {
    return { valid: true, domains: [] };
  }

  // Separator: newline, comma or semicolon (full/half width).
  // Plain spaces are NOT separators so entries like "bad domain" fail validation
  // instead of silently splitting into two domains.
  const parts = input.split(/[\n\r,;，；]+/).map(p => p.trim()).filter(Boolean);

  const domains: string[] = [];
  for (const part of parts) {
    const normalized = normalizeDomain(part);
    const validation = validateDomain(normalized);
    if (!validation.valid) {
      return { valid: false, domains: [], error: `${normalized}: ${validation.error}` };
    }
    if (!domains.includes(normalized)) {
      domains.push(normalized);
    }
  }

  if (domains.length > maxNames) {
    return { valid: false, domains: [], error: `域名数量超过上限 (${maxNames})` };
  }

  return { valid: true, domains };
}

/**
 * Check whether a certificate covering certNames also covers target.
 * Rules:
 *  - exact match always covers
 *  - *.base covers base's single-level subdomains (foo.base) and *.base itself,
 *    but never the apex (base) nor deeper levels (a.b.base)
 */
export function certCoversName(certNames: string[], target: string): boolean {
  const t = normalizeDomain(target);

  for (const raw of certNames) {
    const name = normalizeDomain(raw);
    if (name === t) return true;

    if (isWildcardDomain(name)) {
      const base = getBaseDomain(name);
      if (t.endsWith('.' + base)) {
        const prefix = t.slice(0, -(base.length + 1));
        // single-level: prefix must not contain a dot (also excludes wildcards like *.sub.base)
        if (prefix && !prefix.includes('.')) return true;
      }
    }
  }
  return false;
}
