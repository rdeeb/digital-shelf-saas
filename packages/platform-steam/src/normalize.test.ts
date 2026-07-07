import { describe, expect, it } from 'vitest';
import { normalizeOwnedGame } from './normalize.js';

describe('normalizeOwnedGame', () => {
  it('maps Steam owned-game fields to normalized shape', () => {
    const result = normalizeOwnedGame({
      appid: 570,
      name: 'Dota 2',
      playtime_forever: 120,
      img_icon_url: 'abc123',
      img_logo_url: 'def456',
    });

    expect(result).toEqual({
      externalId: '570',
      name: 'Dota 2',
      playtimeMinutes: 120,
      capsuleUrl:
        'https://media.steampowered.com/steamcommunity/public/images/apps/570/abc123.jpg',
      headerImageUrl:
        'https://media.steampowered.com/steamcommunity/public/images/apps/570/def456.jpg',
      metadataJson: {
        appid: 570,
        name: 'Dota 2',
        playtime_forever: 120,
        img_icon_url: 'abc123',
        img_logo_url: 'def456',
      },
    });
  });

  it('omits image URLs when hashes are empty', () => {
    const result = normalizeOwnedGame({
      appid: 730,
      name: 'Counter-Strike 2',
      playtime_forever: 0,
      img_icon_url: '',
      img_logo_url: '',
    });

    expect(result.capsuleUrl).toBeNull();
    expect(result.headerImageUrl).toBeNull();
    expect(result.playtimeMinutes).toBe(0);
  });
});
