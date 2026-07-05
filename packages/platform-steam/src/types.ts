import { z } from 'zod';

export const steamOwnedGameSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string(),
  playtime_forever: z.number().int().nonnegative().optional().default(0),
  img_icon_url: z.string().optional().default(''),
  img_logo_url: z.string().optional().default(''),
});

export const getOwnedGamesResponseSchema = z.object({
  response: z.object({
    game_count: z.number().int().nonnegative().optional(),
    games: z.array(steamOwnedGameSchema).optional().default([]),
  }),
});

export type SteamOwnedGame = z.infer<typeof steamOwnedGameSchema>;
export type GetOwnedGamesResponse = z.infer<typeof getOwnedGamesResponseSchema>;

export interface NormalizedOwnedGame {
  externalId: string;
  name: string;
  playtimeMinutes: number;
  capsuleUrl: string | null;
  headerImageUrl: string | null;
  metadataJson: SteamOwnedGame;
}

export const steamAppDetailsEntrySchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      type: z.string().optional(),
      name: z.string().optional().default(''),
      steam_appid: z.number().int().positive().optional(),
      developers: z.array(z.string()).optional().default([]),
      publishers: z.array(z.string()).optional().default([]),
      header_image: z.string().url().optional(),
      capsule_image: z.string().url().optional(),
    })
    .optional(),
});

export const steamAppDetailsResponseSchema = z.record(
  z.string(),
  steamAppDetailsEntrySchema,
);

export type SteamAppDetailsEntry = z.infer<typeof steamAppDetailsEntrySchema>;
export type SteamAppDetailsResponse = z.infer<typeof steamAppDetailsResponseSchema>;

export interface NormalizedAppMetadata {
  externalId: string;
  name: string;
  developers: string[];
  publishers: string[];
  headerImageUrl: string | null;
  capsuleImageUrl: string | null;
  metadataJson: unknown;
}
