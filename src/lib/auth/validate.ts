/**
 * Input validators for API routes — UUID format + PostgREST .or() filter
 * sanitizer. Used to close CN-007 injection vector where user input was
 * concatenated into `.or("name.ilike.%${q}%,...")` strings.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Strip characters that PostgREST interprets as .or() filter metacharacters:
 *   , () . : % * \
 * Keeps letters, digits, spaces, and basic punctuation. Safe for ilike
 * search terms. NOT safe for exact-match filters (use `.eq()` with bound
 * param instead).
 */
export function sanitizeOrFilter(s: string, maxLen = 120): string {
  return String(s ?? "")
    .replace(/[,()%*\\.:]/g, "")
    .slice(0, maxLen);
}
