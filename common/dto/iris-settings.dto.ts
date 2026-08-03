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
 * Whether the Iris SDK theme app embed is switched on. Not a setting the pixel
 * acts on directly — it only tells the pixel whether waiting for the SDK's
 * identity can pay off. See extensions/web-pixel/src/wait-for-sdk-identity.ts.
 */
export const irisJsEnabledPrimitive = z.boolean().default(false);

export const IrisSettingsSchema = z.object({
  iris_api_key: irisApiKeyPrimitive,
  iris_api_host: irisApiHostPrimitive,
  iris_enabled: irisEnabledPrimitive,
  iris_js_enabled: irisJsEnabledPrimitive,
});

export type IrisSettings = z.infer<typeof IrisSettingsSchema>;
