/**
 * Domain validation utilities
 */

// Maximum domain length per RFC 1035
const MAX_DOMAIN_LENGTH = 253;
// Maximum label length per RFC 1035
const MAX_LABEL_LENGTH = 63;

// Valid domain pattern: alphanumeric, hyphens, dots
// Each label must start and end with alphanumeric
const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63}(?<!-))*$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a domain name
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

  // Check maximum length
  if (trimmed.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, error: `Domain exceeds maximum length of ${MAX_DOMAIN_LENGTH}` };
  }

  // Check for invalid characters
  if (/[^a-zA-Z0-9.-]/.test(trimmed)) {
    return { valid: false, error: 'Domain contains invalid characters' };
  }

  // Check for consecutive dots
  if (/\.\./.test(trimmed)) {
    return { valid: false, error: 'Domain cannot contain consecutive dots' };
  }

  // Check for leading/trailing dots
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return { valid: false, error: 'Domain cannot start or end with a dot' };
  }

  // Check each label
  const labels = trimmed.split('.');
  
  // Must have at least one label (could be just a hostname)
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
