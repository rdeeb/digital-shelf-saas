import { describe, expect, it } from 'vitest';
import { hashColorFromId } from './hash-color.js';

describe('hashColorFromId', () => {
  it('returns stable hex color for same id', () => {
    expect(hashColorFromId('game_abc')).toBe(hashColorFromId('game_abc'));
    expect(hashColorFromId('game_abc')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
