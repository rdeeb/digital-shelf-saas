import type { SelectionMode, GamesPerFrame } from '@digital-shelf-saas/shared-types';

export interface SelectableUserGame {
  id: string;
  gameId: string;
  hidden: boolean;
  favorite: boolean;
  playtimeMinutes: number | null;
  lastDisplayedAt: Date | null;
}

export interface SelectGamesOptions {
  gamesPerFrame: GamesPerFrame;
  selectionMode: SelectionMode;
  avoidRecentRepeats: boolean;
  now?: Date;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function visibleGames(games: SelectableUserGame[]): SelectableUserGame[] {
  return games.filter((g) => !g.hidden);
}

function filterByMode(games: SelectableUserGame[], mode: SelectionMode): SelectableUserGame[] {
  switch (mode) {
    case 'favorites':
      return games.filter((g) => g.favorite);
    case 'never_played':
      return games.filter((g) => (g.playtimeMinutes ?? 0) === 0);
    case 'most_played':
      return [...games].sort((a, b) => (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0));
    case 'backlog':
      return [...games].sort((a, b) => (a.playtimeMinutes ?? 0) - (b.playtimeMinutes ?? 0));
    case 'random':
    default:
      return games;
  }
}

function applyRepeatAvoidance(
  games: SelectableUserGame[],
  now: Date,
): SelectableUserGame[] {
  const recentCutoffMs = 24 * 60 * 60 * 1000;
  const fresh: SelectableUserGame[] = [];
  const recent: SelectableUserGame[] = [];

  for (const game of games) {
    if (
      game.lastDisplayedAt &&
      now.getTime() - game.lastDisplayedAt.getTime() < recentCutoffMs
    ) {
      recent.push(game);
    } else {
      fresh.push(game);
    }
  }

  return fresh.length >= 1 ? [...shuffle(fresh), ...shuffle(recent)] : shuffle(games);
}

export function selectGames(
  games: SelectableUserGame[],
  options: SelectGamesOptions,
): SelectableUserGame[] {
  const pool = visibleGames(games);
  if (pool.length === 0) {
    return [];
  }

  let candidates = filterByMode(pool, options.selectionMode);
  if (candidates.length < options.gamesPerFrame) {
    candidates = pool;
  }

  const ordered = options.avoidRecentRepeats
    ? applyRepeatAvoidance(candidates, options.now ?? new Date())
    : shuffle(candidates);

  return ordered.slice(0, options.gamesPerFrame);
}
