/**
 * Resolves whether an event must be sent anonymously.
 *
 * Extracted from index.ts because it was an IIFE evaluated **once** when the
 * pixel registered. The `visitorConsentCollected` subscription updated the
 * consent status underneath it, but the resulting boolean was already frozen —
 * so under `non-anonymized-by-consent` a shopper who *revoked* consent mid-page
 * kept having identifiable data sent for the rest of the session, and one who
 * *granted* it was never identified until a reload.
 *
 * Now it's a pure function called per event, so both directions take effect
 * immediately.
 *
 * Same fail-closed rule as the Iris theme embed (extensions/iris-js/assets/
 * privacy.js): anything unrecognized is treated as anonymized.
 */
export type DataCollectionStrategyValue =
  | 'anonymized'
  | 'non-anonymized'
  | 'non-anonymized-by-consent'
  | (string & {});

export function resolveAnonymous(
  strategy: DataCollectionStrategyValue | undefined,
  analyticsProcessingAllowed: boolean | undefined,
): boolean {
  if (strategy === 'non-anonymized') {
    return false;
  }
  if (strategy === 'non-anonymized-by-consent') {
    // Only an explicit `true` counts as consent — undefined means the consent
    // state isn't known yet, which must not read as permission.
    return analyticsProcessingAllowed !== true;
  }
  // 'anonymized', unset, or a value added later than this code.
  return true;
}
