import { z } from 'zod';

export const gamePlatformSchema = z.literal('steam');

export const frameFormatSchema = z.enum(['png', 'rgb565']);

export const selectionModeSchema = z.enum([
  'random',
  'backlog',
  'favorites',
  'most_played',
  'never_played',
]);

export const gamesPerFrameSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const syncRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
]);

export const stringArraySchema = z.array(z.string());

export const deviceConfigSchema = z.object({
  deviceId: z.string().min(1),
  gamesPerFrame: gamesPerFrameSchema,
  rotationIntervalSeconds: z.number().int().positive(),
  selectionMode: selectionModeSchema,
  showPublisher: z.boolean(),
  showPlaytime: z.boolean(),
  avoidRecentRepeats: z.boolean(),
  updatedAt: z.coerce.date(),
});
