/**
 * Rows for the Iris destination's JS SDK config, derived from the schema.
 *
 * Sibling of app/js-web-posthog-settings-rows.ts — one per destination's
 * client-side SDK. The zod walk itself lives in app/zod-settings-rows.ts, shared
 * with that file and with the Web Pixel event list.
 */
import type { IrisJsConfig } from '../common/dto/iris-js-settings.dto';
import { IrisJsConfigSchema } from '../common/dto/iris-js-settings.dto';
import type { Settings } from '../common/interfaces/feature-settings.interface';
import { deriveSettingsRows, withSavedValues } from './zod-settings-rows';

export type IrisJsSettingChoice = Settings<keyof IrisJsConfig>;

export const defaultIrisJsSettings = deriveSettingsRows<keyof IrisJsConfig>(
  IrisJsConfigSchema.shape,
);

/** Rows with the shop's saved values layered over the schema defaults. */
export function irisJsSettingsWithValues(
  saved: Partial<IrisJsConfig> | null | undefined,
): IrisJsSettingChoice[] {
  return withSavedValues(defaultIrisJsSettings, saved);
}
