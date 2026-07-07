import { buildSteamUrl, type FetchImpl } from './client.js';
import { SteamError } from './errors.js';
import { normalizeOwnedGame } from './normalize.js';
import { getOwnedGamesResponseSchema, type NormalizedOwnedGame } from './types.js';

export interface GetOwnedGamesParams {
  steamId: string;
  apiKey: string;
}

export interface GetOwnedGamesOptions {
  fetchImpl?: FetchImpl;
}

export async function getOwnedGames(
  params: GetOwnedGamesParams,
  options: GetOwnedGamesOptions = {},
): Promise<NormalizedOwnedGame[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildSteamUrl('/IPlayerService/GetOwnedGames/v1/', {
    key: params.apiKey,
    steamid: params.steamId,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  });

  const response = await fetchImpl(url);

  if (response.status === 429) {
    throw new SteamError('STEAM_RATE_LIMITED', 'Steam API rate limit exceeded.');
  }

  if (!response.ok) {
    throw new SteamError(
      'STEAM_API_ERROR',
      `Steam API request failed with status ${response.status}. Check that your API key is valid.`,
    );
  }

  const json: unknown = await response.json();
  const parsed = getOwnedGamesResponseSchema.parse(json);
  const games = parsed.response.games ?? [];

  if (games.length === 0) {
    throw new SteamError(
      'STEAM_PRIVATE_LIBRARY',
      'No games were returned. The Steam profile may have private game details.',
    );
  }

  return games.map(normalizeOwnedGame);
}
