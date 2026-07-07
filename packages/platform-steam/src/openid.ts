import type { FetchImpl } from './client.js';

export type SteamOpenIdErrorCode =
  | 'STEAM_OPENID_INVALID_RESPONSE'
  | 'STEAM_OPENID_VERIFICATION_FAILED'
  | 'STEAM_OPENID_INVALID_STEAM_ID';

export class SteamOpenIdError extends Error {
  readonly code: SteamOpenIdErrorCode;

  constructor(code: SteamOpenIdErrorCode, message: string) {
    super(message);
    this.name = 'SteamOpenIdError';
    this.code = code;
  }
}

export interface BuildLoginUrlParams {
  returnTo: string;
  realm: string;
}

export interface VerifyCallbackParams {
  query: Record<string, string>;
  returnTo: string;
  realm: string;
}

export interface VerifyCallbackOptions {
  fetchImpl?: FetchImpl;
}

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export function buildSteamOpenIdLoginUrl(params: BuildLoginUrlParams): string {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set('openid.ns', OPENID_NS);
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', params.returnTo);
  url.searchParams.set('openid.realm', params.realm);
  url.searchParams.set('openid.identity', IDENTIFIER_SELECT);
  url.searchParams.set('openid.claimed_id', IDENTIFIER_SELECT);
  return url.toString();
}

export function extractSteamIdFromClaimedId(claimedId: string): string {
  const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
  const steamId = match?.[1];
  if (!steamId) {
    throw new SteamOpenIdError(
      'STEAM_OPENID_INVALID_STEAM_ID',
      'Steam OpenID response did not contain a valid SteamID64.',
    );
  }
  return steamId;
}

function parseOpenIdKeyValueBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    result[key] = value;
  }
  return result;
}

export async function verifySteamOpenIdCallback(
  params: VerifyCallbackParams,
  options: VerifyCallbackOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { query, returnTo } = params;

  if (query['openid.mode'] !== 'id_res') {
    throw new SteamOpenIdError(
      'STEAM_OPENID_INVALID_RESPONSE',
      'Steam OpenID callback is missing a valid id_res response.',
    );
  }

  if (query['openid.return_to'] !== returnTo) {
    throw new SteamOpenIdError(
      'STEAM_OPENID_INVALID_RESPONSE',
      'Steam OpenID callback return_to does not match the expected value.',
    );
  }

  const verificationBody = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.')) {
      verificationBody.set(key, value);
    }
  }
  verificationBody.set('openid.mode', 'check_authentication');

  const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: verificationBody.toString(),
  });

  if (!response.ok) {
    throw new SteamOpenIdError(
      'STEAM_OPENID_VERIFICATION_FAILED',
      `Steam OpenID verification failed with status ${response.status}.`,
    );
  }

  const parsed = parseOpenIdKeyValueBody(await response.text());
  if (parsed.is_valid !== 'true') {
    throw new SteamOpenIdError(
      'STEAM_OPENID_VERIFICATION_FAILED',
      'Steam OpenID verification was rejected by Steam.',
    );
  }

  const claimedId = query['openid.claimed_id'];
  if (!claimedId) {
    throw new SteamOpenIdError(
      'STEAM_OPENID_INVALID_RESPONSE',
      'Steam OpenID callback is missing claimed_id.',
    );
  }

  return extractSteamIdFromClaimedId(claimedId);
}
