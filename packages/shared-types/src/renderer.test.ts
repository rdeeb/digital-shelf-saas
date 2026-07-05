import { describe, expect, it } from 'vitest';
import { SETTING_DEFAULTS, SETTING_KEYS } from './settings.js';
import type { RenderGame } from './renderer.js';

describe('renderer types', () => {
  it('defaults spine style to gradient', () => {
    expect(SETTING_KEYS.DISPLAY_SPINE_STYLE).toBe('display.spine_style');
    expect(SETTING_DEFAULTS[SETTING_KEYS.DISPLAY_SPINE_STYLE]).toBe('gradient');
    expect(SETTING_KEYS.DISPLAY_SHOW_TITLE).toBe('display.show_title');
    expect(SETTING_DEFAULTS[SETTING_KEYS.DISPLAY_SHOW_TITLE]).toBe('false');
  });

  it('accepts RenderGame shape', () => {
    const game: RenderGame = {
      id: 'game_1',
      name: 'Dota 2',
      publishers: ['Valve'],
      accentColor: '#336699',
      spineTextColor: 'white',
      spineArtPath: null,
    };
    expect(game.name).toBe('Dota 2');
  });
});
