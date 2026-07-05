import { z } from 'zod';

export const frameManifestResponseSchema = z.object({
  frameId: z.string(),
  mode: z.literal('bitmap'),
  format: z.literal('rgb565'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  downloadUrl: z.string(),
  ttlSeconds: z.number().int().positive(),
  refreshAfterSeconds: z.number().int().positive(),
});

export type FrameManifestResponse = z.infer<typeof frameManifestResponseSchema>;
