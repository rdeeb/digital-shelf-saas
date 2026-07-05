import { describe, expect, it } from 'vitest';
import {
  deviceConfigSchema,
  frameFormatSchema,
  gamesPerFrameSchema,
  gamePlatformSchema,
  selectionModeSchema,
  stringArraySchema,
  syncRunStatusSchema,
} from './schemas.js';

describe('enum schemas', () => {
  it('accepts valid game platform', () => {
    expect(gamePlatformSchema.parse('steam')).toBe('steam');
    expect(() => gamePlatformSchema.parse('epic')).toThrow();
  });

  it('accepts valid frame formats', () => {
    expect(frameFormatSchema.parse('png')).toBe('png');
    expect(frameFormatSchema.parse('rgb565')).toBe('rgb565');
    expect(() => frameFormatSchema.parse('jpg')).toThrow();
  });

  it('accepts valid selection modes', () => {
    expect(selectionModeSchema.parse('random')).toBe('random');
    expect(selectionModeSchema.parse('never_played')).toBe('never_played');
    expect(() => selectionModeSchema.parse('invalid')).toThrow();
  });

  it('accepts valid games per frame', () => {
    expect(gamesPerFrameSchema.parse(1)).toBe(1);
    expect(gamesPerFrameSchema.parse(3)).toBe(3);
    expect(() => gamesPerFrameSchema.parse(4)).toThrow();
  });

  it('accepts valid sync run statuses', () => {
    expect(syncRunStatusSchema.parse('pending')).toBe('pending');
    expect(syncRunStatusSchema.parse('failed')).toBe('failed');
    expect(() => syncRunStatusSchema.parse('cancelled')).toThrow();
  });
});

describe('stringArraySchema', () => {
  it('accepts string arrays', () => {
    expect(stringArraySchema.parse(['Valve', 'Hidden Path'])).toEqual([
      'Valve',
      'Hidden Path',
    ]);
  });

  it('rejects non-arrays', () => {
    expect(() => stringArraySchema.parse('not-an-array')).toThrow();
    expect(() => stringArraySchema.parse({})).toThrow();
  });
});

describe('deviceConfigSchema', () => {
  const validConfig = {
    deviceId: 'dev_test123',
    gamesPerFrame: 3,
    rotationIntervalSeconds: 300,
    selectionMode: 'random',
    showPublisher: true,
    showPlaytime: false,
    avoidRecentRepeats: true,
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('accepts a valid device config', () => {
    const result = deviceConfigSchema.parse(validConfig);
    expect(result.deviceId).toBe('dev_test123');
    expect(result.gamesPerFrame).toBe(3);
  });

  it('rejects invalid gamesPerFrame', () => {
    expect(() =>
      deviceConfigSchema.parse({ ...validConfig, gamesPerFrame: 4 }),
    ).toThrow();
  });

  it('rejects invalid selectionMode', () => {
    expect(() =>
      deviceConfigSchema.parse({ ...validConfig, selectionMode: 'invalid' }),
    ).toThrow();
  });
});
