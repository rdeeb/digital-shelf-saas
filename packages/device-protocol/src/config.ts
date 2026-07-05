import { z } from 'zod';
import { gamesPerFrameSchema, selectionModeSchema } from '@digital-shelf-saas/shared-types';

export const deviceConfigResponseSchema = z.object({
  gamesPerFrame: gamesPerFrameSchema,
  rotationIntervalSeconds: z.number().int().positive(),
  selectionMode: selectionModeSchema,
  showPublisher: z.boolean(),
  showPlaytime: z.boolean(),
  avoidRecentRepeats: z.boolean(),
});

export type DeviceConfigResponse = z.infer<typeof deviceConfigResponseSchema>;
