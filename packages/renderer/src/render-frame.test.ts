import { describe, expect, it } from 'vitest';
import { renderFrame } from './render-frame.js';
import type { RenderGame } from '@digital-shelf-saas/shared-types';

const games: RenderGame[] = [
  { id: 'g1', name: 'Dota 2', publishers: ['Valve'], accentColor: '#224466', spineTextColor: 'white', spineArtPath: null },
  { id: 'g2', name: 'Portal', publishers: ['Valve'], accentColor: '#663322', spineTextColor: 'white', spineArtPath: null },
  { id: 'g3', name: 'Half-Life', publishers: ['Valve'], accentColor: '#446622', spineTextColor: 'black', spineArtPath: null },
];

describe('renderFrame', () => {
  it('returns png and rgb565 buffers at target dimensions', async () => {
    const result = await renderFrame(games, {
      width: 172,
      height: 320,
      gamesPerFrame: 3,
      spineStyle: 'gradient',
      showPublisher: true,
      showTitle: true,
    });

    expect(result.width).toBe(172);
    expect(result.height).toBe(320);
    expect(result.png.length).toBeGreaterThan(1000);
    expect(result.rgb565.length).toBe(172 * 320 * 2);
  });
});
