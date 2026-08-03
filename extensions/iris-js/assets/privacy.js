/**
 * Maps VizHog's source-level data collection strategy onto Mythic SDK config.
 *
 * Kept as a pure module rather than inline liquid so it can be checked without a
 * browser — see extensions/iris-js/privacy.check.ts.
 *
 * Shopify's Customer Privacy API has four independent categories (analytics,
 * marketing, preferences, sale_of_data). Only `analytics` gates analytics
 * events, so that's the one read here; the others are the merchant's ad-tech
 * concern, not ours.
 *
 * Worth knowing before you conclude consent gating is broken: in regions with no
 * consent regulation, Shopify's API returns `true` for every category with no
 * banner ever shown. `requireConsent: true` on a US-only shop therefore grants
 * immediately. That's correct, not a bug.
 */

/**
 * SDK config overrides the strategy forces, regardless of what the merchant set
 * on the JS SDK Config page. These are promises the admin UI makes on the source
 * page ("Applies to all destinations"), so the SDK cannot be allowed to opt out.
 *
 * @param {'anonymized'|'non-anonymized'|'non-anonymized-by-consent'|string} strategy
 * @returns {Record<string, unknown>}
 */
export function irisPrivacyOverrides(strategy) {
  if (strategy === 'non-anonymized') {
    // Identify freely. Nothing to force.
    return {};
  }

  if (strategy === 'non-anonymized-by-consent') {
    // Withhold everything until Shopify says analytics is allowed.
    return { requireConsent: true };
  }

  // 'anonymized' (and any unrecognized value — fail to the strictest option).
  //
  // "No identifiable customer data is sent" has to hold for the SDK too, and
  // several autocapture features quietly break it: auto_form_identify lifts an
  // email straight out of a checkout form, auto_input_capture records what was
  // typed, capture_copied_text grabs the clipboard. Session replay stays
  // available because masking is how replay handles this — but input masking
  // stops being optional.
  return {
    requireConsent: false,
    auto_form_identify: false,
    auto_input_capture: false,
    capture_copied_text: false,
    session_replay_mask_all_inputs: true,
  };
}

/**
 * Read analytics consent out of a `visitorConsentCollected` event, falling back
 * to querying the API directly (first run, before any event has fired).
 *
 * @param {{ analyticsAllowed?: boolean } | null | undefined} detail
 *   `event.detail` from visitorConsentCollected, or null to query live.
 * @param {{ analyticsProcessingAllowed?: () => boolean } | null | undefined} api
 *   `window.Shopify.customerPrivacy`.
 * @returns {boolean} False whenever it cannot be established — withholding is
 *   the safe reading of "by consent".
 */
export function analyticsAllowed(detail, api) {
  if (detail && typeof detail.analyticsAllowed === 'boolean') {
    return detail.analyticsAllowed;
  }
  try {
    return api && typeof api.analyticsProcessingAllowed === 'function'
      ? api.analyticsProcessingAllowed() === true
      : false;
  } catch (e) {
    return false;
  }
}

/**
 * Merge the flat `session_replay_*` override back into the nested shape the SDK
 * expects, so an override can't be silently dropped when the merchant has
 * session replay configured.
 *
 * @param {Record<string, any>} config Config as stored (already nested).
 * @param {Record<string, unknown>} overrides From irisPrivacyOverrides.
 * @returns {Record<string, any>} New config object.
 */
export function applyOverrides(config, overrides) {
  const out = Object.assign({}, config);
  for (const key of Object.keys(overrides)) {
    if (key === 'session_replay_mask_all_inputs') {
      // Only meaningful if replay is on at all; `true`/object are both valid.
      if (out.session_replay) {
        out.session_replay =
          typeof out.session_replay === 'object'
            ? Object.assign({}, out.session_replay, { maskAllInputs: true })
            : { enabled: true, maskAllInputs: true };
      }
      continue;
    }
    out[key] = overrides[key];
  }
  return out;
}
