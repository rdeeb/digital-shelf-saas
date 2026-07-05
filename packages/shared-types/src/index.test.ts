import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_CONFIG,
  SETTING_DEFAULTS,
  SETTING_ENV_FALLBACKS,
  SETTING_KEYS,
  createId,
  deviceConfigSchema,
  frameFormatSchema,
  gamesPerFrameSchema,
  gamePlatformSchema,
  selectionModeSchema,
  stringArraySchema,
  syncRunStatusSchema,
} from './index.js';

describe('shared-types exports', () => {
  it('exports setting keys and defaults', () => {
    expect(SETTING_KEYS.STEAM_API_KEY).toBe('steam.api_key');
    expect(SETTING_ENV_FALLBACKS[SETTING_KEYS.STEAM_ID_64]).toBe('STEAM_ID_64');
    expect(SETTING_DEFAULTS[SETTING_KEYS.SERVER_PUBLIC_URL]).toBe(
      'http://localhost:8080',
    );
  });

  it('exports default device config', () => {
    expect(DEFAULT_DEVICE_CONFIG.gamesPerFrame).toBe(3);
    expect(DEFAULT_DEVICE_CONFIG.selectionMode).toBe('random');
  });

  it('exports schemas and createId', () => {
    expect(gamePlatformSchema.parse('steam')).toBe('steam');
    expect(frameFormatSchema.parse('png')).toBe('png');
    expect(selectionModeSchema.parse('random')).toBe('random');
    expect(gamesPerFrameSchema.parse(2)).toBe(2);
    expect(syncRunStatusSchema.parse('completed')).toBe('completed');
    expect(stringArraySchema.parse([])).toEqual([]);
    expect(deviceConfigSchema).toBeDefined();
    expect(createId('device')).toMatch(/^dev_/);
  });
});
