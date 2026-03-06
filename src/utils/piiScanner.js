/**
 * PII Scanner & Masking Utilities
 * Detects and masks personally identifiable information before storage.
 */

// Patterns for common PII types
const PII_PATTERNS = [
  { name: 'email', regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { name: 'phone_gh', regex: /(?:\+?233|0)[2-9]\d{8}/g },          // Ghana phone numbers
  { name: 'phone_intl', regex: /\+?[1-9]\d{7,14}/g },              // Generic international
];

/**
 * Scan text for PII. Returns { hasPii: bool, types: [] }
 */
const scanForPii = (text) => {
  if (!text || typeof text !== 'string') return { hasPii: false, types: [] };
  const found = [];
  for (const { name, regex } of PII_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(text)) found.push(name);
  }
  return { hasPii: found.length > 0, types: found };
};

/**
 * Redact PII in a comment/free-text field.
 * Replace detected patterns with [REDACTED_<TYPE>].
 */
const redactPii = (text) => {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;
  for (const { name, regex } of PII_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, `[REDACTED_${name.toUpperCase()}]`);
  }
  return sanitized;
};

/**
 * Hash a customer ID for warehouse loading (simple one-way mask).
 * Uses a deterministic hex string so the same ID always maps to the same hash.
 */
const maskCustomerId = (customerId) => {
  if (!customerId) return null;
  // Simple deterministic hash (not cryptographic — use bcrypt/sha256 in prod)
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) {
    const chr = customerId.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `MASKED-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
};

/**
 * Mask a delivery address — replace with a placeholder for warehouse.
 */
const maskAddress = (address) => {
  if (!address) return null;
  return '[ADDRESS_MASKED]';
};

module.exports = { scanForPii, redactPii, maskCustomerId, maskAddress };
