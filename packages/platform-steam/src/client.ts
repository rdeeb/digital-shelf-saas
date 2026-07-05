export type FetchImpl = typeof fetch;

export const STEAM_WEB_API_BASE = 'https://api.steampowered.com';
export const STEAM_STORE_API_BASE = 'https://store.steampowered.com';

export function buildSteamUrl(
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(path, STEAM_WEB_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildStoreUrl(
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(path, STEAM_STORE_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
