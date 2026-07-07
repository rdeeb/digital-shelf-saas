import { describe, expect, it } from 'vitest';
import { buildShelfSvg } from './shelf-svg.js';
import type { RenderGame } from '@digital-shelf-saas/shared-types';

const games: RenderGame[] = [
  { id: 'g1', name: 'Dota 2', publishers: ['Valve'], accentColor: '#224466', spineTextColor: 'white', spineArtPath: null },
  { id: 'g2', name: 'Portal', publishers: ['Valve'], accentColor: '#663322', spineTextColor: 'white', spineArtPath: null },
  { id: 'g3', name: 'Half-Life', publishers: ['Valve'], accentColor: '#446622', spineTextColor: 'black', spineArtPath: null },
];

describe('buildShelfSvg', () => {
  it('renders three spines with game titles', () => {
    const svg = buildShelfSvg(games, {
      width: 172,
      height: 320,
      spineStyle: 'gradient',
      showPublisher: true,
      showTitle: true,
    });
    expect(svg).toContain('Dota 2');
    expect(svg).toContain('Portal');
    expect(svg).toContain('STEAM');
    expect(svg).toContain('rotate(90)');
    expect(svg).toContain('translate(');
    expect(svg).toContain('spine-left-g1');
    expect(svg).toContain('<svg');
  });

  it('omits title text when showTitle is false', () => {
    const svg = buildShelfSvg(games, {
      width: 172,
      height: 320,
      spineStyle: 'gradient',
      showPublisher: true,
      showTitle: false,
    });
    expect(svg).not.toContain('rotate(90)');
    expect(svg).toContain('STEAM');
  });
});
