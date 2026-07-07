import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getOwnedGames } from './get-owned-games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/get-owned-games.json'), 'utf8'),
);

describe('getOwnedGames', () => {
  it('parses a successful Steam response', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify(fixture), { status: 200 });

    const games = await getOwnedGames(
      { steamId: '76561198000000000', apiKey: 'test-key' },
      { fetchImpl: fetchMock },
    );

    expect(games).toHaveLength(2);
    expect(games[0]?.externalId).toBe('570');
    expect(games[0]?.name).toBe('Dota 2');
    expect(games[0]?.playtimeMinutes).toBe(120);
  });

  it('throws STEAM_PRIVATE_LIBRARY when no games are returned', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ response: { game_count: 0, games: [] } }), {
        status: 200,
      });

    await expect(
      getOwnedGames(
        { steamId: '76561198000000000', apiKey: 'test-key' },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toMatchObject({
      code: 'STEAM_PRIVATE_LIBRARY',
    });
  });

  it('maps HTTP 403 to STEAM_API_ERROR', async () => {
    const fetchMock = async () => new Response('Forbidden', { status: 403 });

    await expect(
      getOwnedGames(
        { steamId: '76561198000000000', apiKey: 'bad-key' },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toMatchObject({
      code: 'STEAM_API_ERROR',
    });
  });

  it('maps HTTP 429 to STEAM_RATE_LIMITED', async () => {
    const fetchMock = async () => new Response('Too Many Requests', { status: 429 });

    await expect(
      getOwnedGames(
        { steamId: '76561198000000000', apiKey: 'test-key' },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toMatchObject({
      code: 'STEAM_RATE_LIMITED',
    });
  });

  it('never puts the API key in the request URL logged by tests', async () => {
    let requestedUrl = '';
    const fetchMock = async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };

    await getOwnedGames(
      { steamId: '76561198000000000', apiKey: 'secret-key' },
      { fetchImpl: fetchMock },
    );

    expect(requestedUrl).toContain('key=secret-key');
    expect(requestedUrl).toContain('include_appinfo=1');
    expect(requestedUrl).toContain('include_played_free_games=1');
  });
});
