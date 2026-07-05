import { z } from 'zod';
import { selectionModeSchema } from '@digital-shelf-saas/shared-types';

export const userSettingsResponseSchema = z.object({
  display: z.object({
    showPublisher: z.boolean(),
    showPlaytime: z.boolean(),
    gamesPerFrame: z.number().int().positive(),
    rotationIntervalSeconds: z.number().int().positive(),
    selectionMode: selectionModeSchema,
    avoidRecentRepeats: z.boolean(),
  }),
  notifications: z.object({
    emailOptIn: z.boolean(),
  }),
});

export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;

export const updateUserSettingsSchema = z.object({
  display: z
    .object({
      showPublisher: z.boolean().optional(),
      showPlaytime: z.boolean().optional(),
      gamesPerFrame: z.number().int().positive().optional(),
      rotationIntervalSeconds: z.number().int().positive().optional(),
      selectionMode: selectionModeSchema.optional(),
      avoidRecentRepeats: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      emailOptIn: z.boolean().optional(),
    })
    .optional(),
});

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;
