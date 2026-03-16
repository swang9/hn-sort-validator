/**
 * Checks whether an array of ISO timestamp strings is sorted newest-to-oldest.
 *
 * Rules:
 *   - Ties (same second) are allowed — not flagged as violations.
 *   - Null/missing timestamps are skipped rather than producing false results.
 *     (new Date(null) returns epoch time and would silently skew comparisons)
 *
 * @param {(string|null)[]} timestamps
 * @returns {{
 *   violations: Set<number>,
 *   details: Array<{ i: number, current: string, next: string }>
 * }}
 */
function checkSortOrder(timestamps) {
  const violations = new Set();
  const details = [];

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (!timestamps[i] || !timestamps[i + 1]) continue;

    const current = new Date(timestamps[i]);
    const next = new Date(timestamps[i + 1]);

    if (current < next) {
      violations.add(i);
      violations.add(i + 1);
      details.push({ i, current: timestamps[i], next: timestamps[i + 1] });
    }
  }

  return { violations, details };
}

module.exports = { checkSortOrder };
