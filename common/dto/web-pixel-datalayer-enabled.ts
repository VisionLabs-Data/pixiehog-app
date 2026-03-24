import { z } from 'zod';

export const WebPixelDataLayerEnabledSchema = z.object({
  datalayer_enabled: z.boolean(),
});

export type WebPixelDataLayerEnabled = z.infer<typeof WebPixelDataLayerEnabledSchema>;
