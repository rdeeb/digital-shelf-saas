import type { NormalizedOwnedGame, SteamOwnedGame } from './types.js';

function buildSteamImageUrl(appId: number, hash: string): string | null {
  if (!hash) {
    return null;
  }
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
}

export function normalizeOwnedGame(game: SteamOwnedGame): NormalizedOwnedGame {
  return {
    externalId: String(game.appid),
    name: game.name,
    playtimeMinutes: game.playtime_forever ?? 0,
    capsuleUrl: buildSteamImageUrl(game.appid, game.img_icon_url ?? ''),
    headerImageUrl: buildSteamImageUrl(game.appid, game.img_logo_url ?? ''),
    metadataJson: game,
  };
}
