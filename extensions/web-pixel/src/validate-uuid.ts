/**
 * Pulls the UUID out of a Shopify Web Pixel event id.
 *
 * Shopify sends ids as `sh-<uuid>` (e.g.
 * `sh-c9ac130f-EF2A-4A3C-1A13-92F2E7A19D32`), so the prefix has to come off
 * before the value is usable as an event UUID.
 *
 * This used to try the whole string first, `console.warn` the failure, and only
 * then strip the prefix and succeed. Since every real event id carries the
 * prefix, that warned on the happy path — one "Invalid event UUID: sh-…" per
 * event, on every page, describing something that then worked fine. Nothing was
 * dropped; it just read like a fault. The warning now fires only when nothing
 * parses, which is the case actually worth seeing.
 *
 * The pattern is deliberately permissive about the version and variant nibbles:
 * Shopify's ids are not RFC 4122 conformant (the observed variant nibble is `1`,
 * where the spec wants 8/9/a/b), and enforcing that would reject the very ids we
 * were asked to read.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Plain boolean, NOT a `uuid is string` type predicate. The predicate said "this
 * input is a string" when what it means is "this string is a well-formed UUID",
 * so once the caller had already ruled out undefined, TypeScript narrowed the
 * false branch to `never` and rejected any further use of the value.
 */
function isValidUUID(uuid: string | undefined): boolean {
  return typeof uuid === 'string' && UUID_RE.test(uuid);
}

export function extractEventUUID(eventId: string | undefined): string | undefined {
  if (!eventId) return undefined;

  if (isValidUUID(eventId)) {
    return eventId;
  }

  // Strip a single leading `<prefix>-` and retry. When there's no dash,
  // `indexOf` returns -1 and this is substring(0) — the original string — which
  // simply fails the test again.
  const afterPrefix = eventId.substring(eventId.indexOf('-') + 1);
  if (isValidUUID(afterPrefix)) {
    return afterPrefix;
  }

  console.warn(`[vizhog] Invalid event UUID: ${eventId}`);
  return undefined;
}
