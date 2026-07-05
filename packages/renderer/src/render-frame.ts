import sharp from 'sharp';
import type { RenderFrameOptions, RenderGame, RenderedFrame } from '@digital-shelf-saas/shared-types';
import { buildShelfSvg } from './shelf-svg.js';
import { pngBufferToRgb565 } from './rgb565.js';

export async function renderFrame(
  games: RenderGame[],
  options: RenderFrameOptions,
): Promise<RenderedFrame> {
  const svg = buildShelfSvg(games, {
    width: options.width,
    height: options.height,
    spineStyle: options.spineStyle,
    showPublisher: options.showPublisher,
    showTitle: options.showTitle,
    artRootPath: options.artRootPath,
  });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const rgb565 = await pngBufferToRgb565(png);

  return {
    png,
    rgb565,
    width: options.width,
    height: options.height,
  };
}
