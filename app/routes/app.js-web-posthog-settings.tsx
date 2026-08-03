/**
 * Redirect only. The PostHog JS SDK form now lives in the PostHog destination's
 * rail (/app/destinations/posthog?step=sdk-config), so that both destinations
 * present the same set of setup steps instead of PostHog's config being a
 * top-level page and Iris's being a step.
 *
 * Kept as a route rather than deleted because this path was in the nav for a
 * long time and is linked from older screenshots and bookmarks; 404ing it would
 * be a worse answer than moving people along.
 *
 * A flat file, not a directory: the row-derivation modules that used to live
 * alongside it moved to app/js-web-posthog-settings-rows.ts, next to their Iris
 * sibling, leaving nothing here but the redirect.
 */
import { redirect } from '@remix-run/node';

export const loader = () => redirect('/app/destinations/posthog?step=sdk-config');

// Client-side navigations don't hit the server loader, so the redirect has to be
// declared on both sides or an in-app link would render an empty route.
export const clientLoader = () => redirect('/app/destinations/posthog?step=sdk-config');
