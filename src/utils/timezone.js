/**
 * Timezone Utilities
 * Ghana operates on GMT+0 (no DST). UTC === Ghana time.
 * This module exists for clarity and future-proofing.
 */

/**
 * Convert a UTC ISO timestamp string to a Ghana GMT+0 Date object.
 * Since Ghana is GMT+0, the Date object value is identical to UTC.
 * We store the original UTC timestamp and annotate it as Ghana time.
 */
const utcToGhanaTime = (utcTimestamp) => {
  if (!utcTimestamp) return null;
  const date = new Date(utcTimestamp);
  if (isNaN(date.getTime())) return null;
  // Ghana is UTC+0, so no offset needed. Return the same Date.
  return date;
};

/**
 * Format a Date as an ISO string in Ghana/GMT+0 context.
 */
const toGhanaISOString = (date) => {
  if (!date) return null;
  return new Date(date).toISOString().replace('Z', '+00:00');
};

module.exports = { utcToGhanaTime, toGhanaISOString };
