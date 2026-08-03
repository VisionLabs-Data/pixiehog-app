import { z } from 'zod';

// `.or(z.literal(''))` before `.default('')` because zod validates the default
// through the inner schema: a bare `.url().default('')` rejects its own default,
// which made posthog_api_host effectively required and stopped an Iris-only shop
// from producing valid Web Pixel settings. Empty = PostHog not configured.
export const posthogApiHostPrimitive = z
  .string()
  .describe('PostHog API Host.')
  .trim()
  .url()
  .or(z.literal(''))
  .default('')

export const PosthogApiHostSchema = z.object({
  posthog_api_host: posthogApiHostPrimitive
});

export type PosthogApiHost = z.infer<typeof PosthogApiHostSchema>;
export type PosthogApiHostPrimitive = z.infer<typeof posthogApiHostPrimitive>;