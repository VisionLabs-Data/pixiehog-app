/** Marks used by the tracking graph. PostHog/Shopify already have real SVGs. */
export { posthogSvg } from './routes/app.web-pixel-settings/posthog.svg';
export { shopifySvg } from './routes/app.web-pixel-settings/shopify.svg';

/** Iris has no published logo — a neutral aperture mark stands in for it. */
export const irisSvg = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#4a4aff" strokeWidth="2" />
    <circle cx="12" cy="12" r="3.5" fill="#4a4aff" />
  </svg>
);

/** Server-side webhook source. */
export const webhookSvg = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 3v6m0 0-3-3m3 3 3-3M5 13a7 7 0 0 0 14 0"
      stroke="#5E8E3E"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="5" cy="16" r="2.5" fill="#5E8E3E" />
    <circle cx="19" cy="16" r="2.5" fill="#5E8E3E" />
  </svg>
);
