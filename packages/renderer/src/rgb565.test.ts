import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { pngToRgb565 } from './rgb565.js';

describe('pngToRgb565', () => {
  it('converts a 2x2 PNG to 8 bytes little-endian RGB565', async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await pngToRgb565(png);
    expect(result.length).toBe(8);
  });
});
