import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SteamError } from './errors.js';
import { getAppDetails } from './get-app-details.js';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

describe('getAppDetails', () => {
  it('fetches and normalizes app metadata', async () => {
    const fixture = readFileSync(
      path.join(fixtureDir, 'fixtures/app-details-570.json'),
      'utf8',
    );

    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toContain('store.steampowered.com/api/appdetails');
      expect(String(url)).toContain('appids=570');
      return new Response(fixture, { status: 200 });
    };

    const result = await getAppDetails({ appId: '570' }, { fetchImpl });

    expect(result.externalId).toBe('570');
    expect(result.publishers).toEqual(['Valve']);
    expect(result.developers).toEqual(['Valve']);
  });

  it('throws STEAM_APP_NOT_FOUND when success is false', async () => {
    const fixture = readFileSync(
      path.join(fixtureDir, 'fixtures/app-details-missing.json'),
      'utf8',
    );

    const fetchImpl = async () => new Response(fixture, { status: 200 });

    await expect(getAppDetails({ appId: '999999' }, { fetchImpl })).rejects.toMatchObject({
      code: 'STEAM_APP_NOT_FOUND',
    });
  });

  it('throws STEAM_RATE_LIMITED on HTTP 429', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 });

    await expect(getAppDetails({ appId: '570' }, { fetchImpl })).rejects.toBeInstanceOf(
      SteamError,
    );
    await expect(getAppDetails({ appId: '570' }, { fetchImpl })).rejects.toMatchObject({
      code: 'STEAM_RATE_LIMITED',
    });
  });

  it('throws STEAM_RATE_LIMITED on HTTP 403', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });

    await expect(getAppDetails({ appId: '570' }, { fetchImpl })).rejects.toMatchObject({
      code: 'STEAM_RATE_LIMITED',
    });
  });
});
