import { describe, expect, it } from 'vitest';
import { selectGames, type SelectableUserGame } from './select-games.js';

const baseGames: SelectableUserGame[] = [
  { id: 'ug1', gameId: 'g1', hidden: false, favorite: true, playtimeMinutes: 0, lastDisplayedAt: null },
  { id: 'ug2', gameId: 'g2', hidden: false, favorite: false, playtimeMinutes: 500, lastDisplayedAt: new Date('2026-07-02T10:00:00.000Z') },
  { id: 'ug3', gameId: 'g3', hidden: false, favorite: false, playtimeMinutes: 10, lastDisplayedAt: null },
  { id: 'ug4', gameId: 'g4', hidden: true, favorite: false, playtimeMinutes: 0, lastDisplayedAt: null },
];

describe('selectGames', () => {
  it('favorites mode picks only favorites', () => {
    const result = selectGames(baseGames, {
      gamesPerFrame: 1,
      selectionMode: 'favorites',
      avoidRecentRepeats: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.gameId).toBe('g1');
  });

  it('falls back to random when favorites pool is too small', () => {
    const result = selectGames(baseGames, {
      gamesPerFrame: 3,
      selectionMode: 'favorites',
      avoidRecentRepeats: false,
    });
    expect(result.length).toBe(3);
    expect(result.every((g) => !g.hidden)).toBe(true);
  });

  it('avoidRecentRepeats deprioritizes recently displayed games', () => {
    const result = selectGames(baseGames, {
      gamesPerFrame: 2,
      selectionMode: 'random',
      avoidRecentRepeats: true,
      now: new Date('2026-07-02T12:00:00.000Z'),
    });
    const ids = result.map((g) => g.gameId);
    expect(ids).not.toContain('g2');
  });
});
