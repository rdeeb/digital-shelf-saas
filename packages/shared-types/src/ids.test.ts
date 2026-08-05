import { describe, expect, it } from 'vitest';
import { ID_PREFIX, createId } from './ids.js';

describe('createId', () => {
  it('prefixes IDs with the entity prefix', () => {
    expect(createId('device')).toMatch(/^dev_/);
    expect(createId('game')).toMatch(/^game_/);
    expect(createId('frame')).toMatch(/^frame_/);
    expect(createId('sync')).toMatch(/^sync_/);
    expect(createId('platformAccount')).toMatch(/^plat_/);
    expect(createId('userGame')).toMatch(/^ug_/);
    expect(createId('metadata')).toMatch(/^meta_/);
    expect(createId('err')).toMatch(/^err_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId('game')));
    expect(ids.size).toBe(100);
  });

  it('exports all expected prefixes', () => {
    expect(ID_PREFIX).toEqual({
      game: 'game',
      userGame: 'ug',
      platformAccount: 'plat',
      authIdentity: 'authid',
      device: 'dev',
      frame: 'frame',
      sync: 'sync',
      metadata: 'meta',
      err: 'err',
      user: 'user',
      session: 'sess',
      sub: 'sub',
      subEvent: 'subev',
      authCode: 'acode',
    });
  });
});
