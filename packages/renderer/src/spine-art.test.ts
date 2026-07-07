import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processSpineArt } from './spine-art.js';

describe('processSpineArt', () => {
  it('rotates, resizes to target height, and returns average color', async () => {
    const input = await sharp({
      create: { width: 80, height: 30, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const result = await processSpineArt(input, { targetHeight: 320 });

    expect(result.height).toBe(320);
    expect(result.width).toBeGreaterThan(0);
    expect(result.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(['white', 'black']).toContain(result.spineTextColor);
    expect(result.jpeg.length).toBeGreaterThan(0);
  });
});
