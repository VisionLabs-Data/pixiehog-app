import { z } from 'zod';

// Empty string = not configured, and `.default('')` makes the field optional in
// WebPixelSettingsSchema. Without the default, an Iris-only shop produced a
// settings object with no posthog_api_key at all, safeParse failed, and
// recalculateWebPixel read that failure as "no settings" and DELETED the pixel —
// so Iris could never run without PostHog. Mirrors irisApiKeyPrimitive.
export const posthogApiKeyPrimitive = z.string().trim().startsWith('phc_').or(z.literal('')).default('')

export const PosthogApiKeySchema = z.object({
  posthog_api_key: posthogApiKeyPrimitive,
});

export type PosthogApiKey = z.infer<typeof PosthogApiKeySchema>;
export type posthogApiKeyPrimitive = z.infer<typeof posthogApiKeyPrimitive>;