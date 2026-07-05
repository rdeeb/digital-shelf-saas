import { z } from 'zod';

export const adminGamesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  q: z.string().optional(),
  favorite: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  hidden: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  publisherStatus: z.enum(['has', 'missing', 'all']).default('all'),
  sort: z.enum(['name', 'playtime', 'recently_synced']).default('name'),
});

export type AdminGamesQuery = z.infer<typeof adminGamesQuerySchema>;

export const adminGamePatchSchema = z
  .object({
    favorite: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((value) => value.favorite !== undefined || value.hidden !== undefined, {
    message: 'At least one of favorite or hidden is required',
  });

export type AdminGamePatch = z.infer<typeof adminGamePatchSchema>;

export const adminGameListItemSchema = z.object({
  userGameId: z.string(),
  gameId: z.string(),
  name: z.string(),
  publishers: z.array(z.string()),
  playtimeMinutes: z.number().int().nullable(),
  favorite: z.boolean(),
  hidden: z.boolean(),
  metadataUpdatedAt: z.string().nullable(),
});

export type AdminGameListItem = z.infer<typeof adminGameListItemSchema>;

export const adminGamesResponseSchema = z.object({
  games: z.array(adminGameListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type AdminGamesResponse = z.infer<typeof adminGamesResponseSchema>;
