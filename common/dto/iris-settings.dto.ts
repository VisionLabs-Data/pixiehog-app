import { z } from 'zod';
import { Constant } from '../constant';

// Iris publishable key (pk_...). Empty string = not configured (mirrors posthog_api_key).
export const irisApiKeyPrimitive = z.string().trim().startsWith('pk_').or(z.literal('')).default('');

// Ingestion host. Defaults to Iris production worker.
export const irisApiHostPrimitive = z
  .string()
  .trim()
  .url()
  .or(z.literal(''))
  .default(Constant.IRIS_DEFAULT_API_HOST);

export const irisEnabledPrimitive = z.boolean().default(false);

/**
 * Whether the Iris SDK theme app embed is switched on.
 *
 * Nothing reads this any more. It existed to tell the pixel whether waiting for
 * the SDK's identity could pay off; the pixel now decides that at runtime —
 * it gates its first send on the SDK's records appearing and falls back to an
 * alias heal on timeout, which is correct whether or not an SDK ever loads.
 * Removal candidate — left in place only because dropping a declared pixel
 * settings field forces every shop through a pixel recalculate.
 */
export const irisJsEnabledPrimitive = z.boolean().default(false);

/**
 * Whether Iris receives PostHog's ecommerce-spec event names (`$pageview`)
 * rather than Shopify's (`page_viewed`).
 *
 * Iris's own flag, separate from posthog_ecommerce_spec. Previously the pixel
 * renamed once and sent the same name everywhere, so a PostHog-only setting
 * silently decided Iris's event names too. recalculateWebPixel defaults this from
 * the PostHog value when a shop has never set it, so nothing changes on the wire
 * for existing shops until they choose to diverge.
 */
export const irisEcommerceSpecPrimitive = z.boolean().default(false);

export const IrisSettingsSchema = z.object({
  iris_api_key: irisApiKeyPrimitive,
  iris_api_host: irisApiHostPrimitive,
  iris_enabled: irisEnabledPrimitive,
  iris_js_enabled: irisJsEnabledPrimitive,
  iris_ecommerce_spec: irisEcommerceSpecPrimitive,
});

export type IrisSettings = z.infer<typeof IrisSettingsSchema>;
