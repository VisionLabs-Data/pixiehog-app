import type { z } from 'zod';
import { PosthogApiKeySchema } from './posthog-api-key.dto';
import { PosthogApiHostSchema } from './posthog-api-host.dto';
import { DataCollectionStrategySchema } from './data-collection-stratergy';
import { WebPixelTrackedEventsSchema } from './web-pixel-tracked-events.dto';
import { WebPixelPostHogEcommerceSpecSchema } from './web-pixel-posthog-ecommerce-spec';
import { WebPixelDataLayerEnabledSchema } from './web-pixel-datalayer-enabled';

export const WebPixelSettingsSchema = PosthogApiKeySchema.merge(PosthogApiHostSchema)
  .merge(DataCollectionStrategySchema)
  .merge(WebPixelTrackedEventsSchema)
  .merge(WebPixelPostHogEcommerceSpecSchema)
  .merge(WebPixelDataLayerEnabledSchema);

export type WebPixelSettings = z.infer<typeof WebPixelSettingsSchema>;
