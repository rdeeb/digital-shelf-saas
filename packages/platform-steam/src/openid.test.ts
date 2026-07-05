import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SteamOpenIdError,
  buildSteamOpenIdLoginUrl,
  extractSteamIdFromClaimedId,
  verifySteamOpenIdCallback,
} from './openid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const callbackFixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/openid-callback.json'), 'utf8'),
) as Record<string, string>;

const returnTo = 'http://localhost:8080/api/admin/steam/callback';
const realm = 'http://localhost:8080';

describe('buildSteamOpenIdLoginUrl', () => {
  it('builds a Steam OpenID checkid_setup URL', () => {
    const url = buildSteamOpenIdLoginUrl({ returnTo, realm });
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://steamcommunity.com');
    expect(parsed.pathname).toBe('/openid/login');
    expect(parsed.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(parsed.searchParams.get('openid.return_to')).toBe(returnTo);
    expect(parsed.searchParams.get('openid.realm')).toBe(realm);
  });
});

describe('extractSteamIdFromClaimedId', () => {
  it('extracts a 17-digit SteamID64', () => {
    expect(
      extractSteamIdFromClaimedId('https://steamcommunity.com/openid/id/76561198000000000'),
    ).toBe('76561198000000000');
  });

  it('rejects invalid claimed IDs', () => {
    expect(() => extractSteamIdFromClaimedId('https://example.com/not-steam')).toThrow(
      SteamOpenIdError,
    );
  });
});

describe('verifySteamOpenIdCallback', () => {
  it('returns SteamID64 when Steam marks the response valid', async () => {
    const fetchMock = async () =>
      new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 });

    const steamId = await verifySteamOpenIdCallback(
      { query: callbackFixture, returnTo, realm },
      { fetchImpl: fetchMock },
    );

    expect(steamId).toBe('76561198000000000');
  });

  it('throws when Steam marks the response invalid', async () => {
    const fetchMock = async () =>
      new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n', { status: 200 });

    await expect(
      verifySteamOpenIdCallback(
        { query: callbackFixture, returnTo, realm },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toMatchObject({ code: 'STEAM_OPENID_VERIFICATION_FAILED' });
  });

  it('rejects callbacks with the wrong return_to', async () => {
    await expect(
      verifySteamOpenIdCallback({
        query: callbackFixture,
        returnTo: 'http://evil.example/callback',
        realm,
      }),
    ).rejects.toMatchObject({ code: 'STEAM_OPENID_INVALID_RESPONSE' });
  });
});
