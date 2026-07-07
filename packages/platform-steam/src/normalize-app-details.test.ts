import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeAppDetails } from './normalize-app-details.js';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

describe('normalizeAppDetails', () => {
  it('maps Store appdetails data to normalized metadata', () => {
    const raw = JSON.parse(
      readFileSync(path.join(fixtureDir, 'fixtures/app-details-570.json'), 'utf8'),
    );

    const result = normalizeAppDetails('570', raw['570']);

    expect(result).toEqual({
      externalId: '570',
      name: 'Dota 2',
      developers: ['Valve'],
      publishers: ['Valve'],
      headerImageUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
      capsuleImageUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/capsule_231x87.jpg',
      metadataJson: raw['570'].data,
    });
  });

  it('maps header_image and capsule_image URLs', () => {
    const result = normalizeAppDetails('570', {
      success: true,
      data: {
        type: 'game',
        name: 'Dota 2',
        steam_appid: 570,
        developers: ['Valve'],
        publishers: ['Valve'],
        header_image: 'https://cdn.example/header.jpg',
        capsule_image: 'https://cdn.example/capsule.jpg',
      },
    });

    expect(result.headerImageUrl).toBe('https://cdn.example/header.jpg');
    expect(result.capsuleImageUrl).toBe('https://cdn.example/capsule.jpg');
  });

  it('returns empty arrays when developers/publishers are missing', () => {
    const result = normalizeAppDetails('730', {
      success: true,
      data: {
        type: 'game',
        name: 'Counter-Strike 2',
        steam_appid: 730,
      },
    });

    expect(result.developers).toEqual([]);
    expect(result.publishers).toEqual([]);
    expect(result.headerImageUrl).toBeNull();
    expect(result.capsuleImageUrl).toBeNull();
    expect(result.name).toBe('Counter-Strike 2');
  });
});
