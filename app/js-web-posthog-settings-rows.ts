/**
 * Rows for the PostHog destination's JS SDK config, derived from the schema.
 *
 * Sits beside app/iris-js-settings-rows.ts because the two are siblings: one per
 * destination's client-side SDK. It used to live inside the
 * app.js-web-posthog-settings route directory, which is now nothing but a
 * redirect — the form itself moved into the PostHog destination's rail.
 */
import type { JsWebPosthogConfig } from '../common/dto/js-web-settings.dto';
import { JsWebPosthogConfigSchema } from '../common/dto/js-web-settings.dto';
import type { Settings } from '../common/interfaces/feature-settings.interface';
import { deriveSettingsRows, withSavedValues } from './zod-settings-rows';

export type JsWebPosthogSettingChoice = Settings<keyof JsWebPosthogConfig>;

export const defaultJsWebPosthogSettings = deriveSettingsRows<keyof JsWebPosthogConfig>(
  JsWebPosthogConfigSchema.shape,
);

/** Rows with the shop's saved values layered over the schema defaults. */
export function jsWebPosthogSettingsWithValues(
  saved: Partial<JsWebPosthogConfig> | null | undefined,
): JsWebPosthogSettingChoice[] {
  return withSavedValues(defaultJsWebPosthogSettings, saved);
}
