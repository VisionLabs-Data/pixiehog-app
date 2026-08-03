/**
 * Rows for the Shopify Web source's event list, derived from the schema.
 *
 * Replaces a hand-rolled zod walk that didn't typecheck, plus 120 lines of the
 * commented-out hand-written array it superseded.
 */
import type { WebPixelSettingChoice } from './interface/setting-row.interface';
import { WebPixelEventsSettingsSchema } from 'common/dto/web-pixel-events-settings.dto';
import { deriveSettingsRows } from '../../zod-settings-rows';

export const defaultWebPixelSettings = deriveSettingsRows(
  WebPixelEventsSettingsSchema.shape,
) as WebPixelSettingChoice[];
