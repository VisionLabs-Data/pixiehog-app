import { z } from 'zod';
import { Constant } from '../constant';

// Mythic publishable key (pk_...). Empty string = not configured (mirrors posthog_api_key).
export const mythicApiKeyPrimitive = z.string().trim().startsWith('pk_').or(z.literal('')).default('');

// Ingestion host. Defaults to Mythic production worker.
export const mythicApiHostPrimitive = z
  .string()
  .trim()
  .url()
  .or(z.literal(''))
  .default(Constant.MYTHIC_DEFAULT_API_HOST);

export const mythicEnabledPrimitive = z.boolean().default(false);

export const MythicSettingsSchema = z.object({
  mythic_api_key: mythicApiKeyPrimitive,
  mythic_api_host: mythicApiHostPrimitive,
  mythic_enabled: mythicEnabledPrimitive,
});

export type MythicSettings = z.infer<typeof MythicSettingsSchema>;
