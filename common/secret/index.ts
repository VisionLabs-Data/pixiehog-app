import { z } from "zod";

const envSchema = z.object({
  APP_POSTHOG_JS_WEB_THEME_APP_UUID: z.string().readonly(),
  // Optional: a theme extension has no registration UUID until its first
  // deploy, so this is legitimately empty until iris-js has shipped once.
  // Empty means "can't tell if the embed is active", handled in appEmbedStatus.
  APP_IRIS_JS_THEME_APP_UUID: z.string().readonly().default(''),
  SHOPIFY_APP_URL: z.string().readonly(),
  SHOPIFY_API_KEY: z.string().readonly(),
  SHOPIFY_API_SECRET: z.string().readonly(),
})
export type SecretsSchema = z.infer<typeof envSchema>;

let initEnv: SecretsSchema = {
  APP_POSTHOG_JS_WEB_THEME_APP_UUID: (process.env.SHOPIFY_POSTHOG_JS_ID || process.env.APP_POSTHOG_JS_WEB_THEME_APP_UUID) as string,
  APP_IRIS_JS_THEME_APP_UUID: (process.env.SHOPIFY_IRIS_JS_ID || process.env.APP_IRIS_JS_THEME_APP_UUID || '') as string,
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY as string,
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET as string,
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL as string,
}

export const APP_ENV = envSchema.parse(initEnv)
