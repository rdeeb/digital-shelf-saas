import { buildStoreUrl, type FetchImpl } from './client.js';
import { SteamError } from './errors.js';
import { normalizeAppDetails } from './normalize-app-details.js';
import {
  steamAppDetailsResponseSchema,
  type NormalizedAppMetadata,
} from './types.js';

export interface GetAppDetailsParams {
  appId: string;
}

export interface GetAppDetailsOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

export async function getAppDetails(
  params: GetAppDetailsParams,
  options: GetAppDetailsOptions = {},
): Promise<NormalizedAppMetadata> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const url = buildStoreUrl('/api/appdetails', {
    appids: params.appId,
    l: 'english',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SteamError(
        'STEAM_API_ERROR',
        `Steam Store metadata request timed out for app ${params.appId}.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429 || response.status === 403) {
    throw new SteamError(
      'STEAM_RATE_LIMITED',
      'Steam Store rate-limited metadata requests. Retry after a short delay.',
    );
  }

  if (!response.ok) {
    throw new SteamError(
      'STEAM_API_ERROR',
      `Steam Store metadata request failed with status ${response.status}.`,
    );
  }

  const json: unknown = await response.json();
  const parsed = steamAppDetailsResponseSchema.parse(json);
  const entry = parsed[params.appId];

  if (!entry || !entry.success) {
    throw new SteamError(
      'STEAM_APP_NOT_FOUND',
      `Steam Store returned no metadata for app ${params.appId}.`,
    );
  }

  return normalizeAppDetails(params.appId, entry);
}
