import type { RenderGame, SpineStyle } from '@digital-shelf-saas/shared-types';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ShelfSvgOptions {
  width: number;
  height: number;
  spineStyle: SpineStyle;
  showPublisher: boolean;
  showTitle: boolean;
  artRootPath?: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function truncateForVerticalTitle(value: string, spineHeight: number, fontSize: number): string {
  const maxChars = Math.max(6, Math.floor((spineHeight - 56) / (fontSize * 0.55)));
  return truncate(value, maxChars);
}

function spineDepthOverlay(gameId: string, spineWidth: number, spineHeight: number): string {
  const edgeWidth = Math.max(4, Math.round(spineWidth * 0.18));
  const rightX = spineWidth - edgeWidth;
  return `<defs><linearGradient id="spine-left-${gameId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${edgeWidth}" y2="0"><stop offset="0%" stop-color="#000000" stop-opacity="0.75"/><stop offset="100%" stop-color="#000000" stop-opacity="0"/></linearGradient><linearGradient id="spine-right-${gameId}" gradientUnits="userSpaceOnUse" x1="${rightX}" y1="0" x2="${spineWidth}" y2="0"><stop offset="0%" stop-color="#000000" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.75"/></linearGradient></defs><rect x="0" y="0" width="${edgeWidth}" height="${spineHeight}" fill="url(#spine-left-${gameId})"/><rect x="${rightX}" y="0" width="${edgeWidth}" height="${spineHeight}" fill="url(#spine-right-${gameId})"/>`;
}

function verticalTitleText(
  game: RenderGame,
  spineWidth: number,
  spineHeight: number,
  fill: string,
): string {
  const fontSize = 9;
  const centerX = spineWidth / 2;
  const centerY = spineHeight * 0.48;
  const title = truncateForVerticalTitle(game.name, spineHeight, fontSize);
  return `<g transform="translate(${centerX}, ${centerY}) rotate(90)"><text x="0" y="0" fill="${fill}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(title)}</text></g>`;
}

function darkenHex(hex: string, percent: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 - percent / 100;
  const toHex = (n: number) => Math.round(n * factor).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function spineBackground(
  game: RenderGame,
  style: SpineStyle,
  artRootPath: string | undefined,
  spineWidth: number,
  spineHeight: number,
): string {
  if (style === 'image' && game.spineArtPath && artRootPath) {
    const fullPath = path.isAbsolute(game.spineArtPath)
      ? game.spineArtPath
      : path.join(artRootPath, game.spineArtPath);
    if (existsSync(fullPath)) {
      const base64 = readFileSync(fullPath).toString('base64');
      return `<defs><clipPath id="clip-${game.id}"><rect x="0" y="0" width="${spineWidth}" height="${spineHeight}"/></clipPath></defs><image href="data:image/jpeg;base64,${base64}" x="0" y="-18" width="${spineWidth}" height="${spineHeight + 36}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${game.id})"/><rect width="${spineWidth}" height="${spineHeight}" fill="#000000" opacity="0.25"/>`;
    }
  }
  const dark = darkenHex(game.accentColor, 30);
  return `<defs><linearGradient id="grad-${game.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${game.accentColor}"/><stop offset="100%" stop-color="${dark}"/></linearGradient></defs><rect width="${spineWidth}" height="${spineHeight}" fill="url(#grad-${game.id})"/>`;
}

export function buildShelfSvg(games: RenderGame[], options: ShelfSvgOptions): string {
  const shelfHeight = 24;
  const spineAreaHeight = options.height - shelfHeight - 8;
  const spineWidth = Math.floor(options.width / games.length);
  const textFill = (game: RenderGame) => (game.spineTextColor === 'white' ? '#ffffff' : '#111111');

  const spines = games
    .map((game, index) => {
      const x = index * spineWidth;
      const innerWidth = spineWidth - 2;
      const publisher =
        options.showPublisher && game.publishers[0] ? truncate(game.publishers[0], 14) : '';
      const fill = textFill(game);
      const titleMarkup = options.showTitle
        ? verticalTitleText(game, innerWidth, spineAreaHeight, fill)
        : '';
      return `<g transform="translate(${x}, 8)">${spineBackground(game, options.spineStyle, options.artRootPath, innerWidth, spineAreaHeight)}${spineDepthOverlay(game.id, innerWidth, spineAreaHeight)}<rect x="0" y="0" width="${innerWidth}" height="${spineAreaHeight}" fill="none" stroke="#00000033" stroke-width="1"/>${titleMarkup}${publisher ? `<text x="${innerWidth / 2}" y="${spineAreaHeight - 20}" fill="${fill}" font-family="sans-serif" font-size="7" text-anchor="middle">${escapeXml(publisher)}</text>` : ''}<text x="${innerWidth / 2}" y="${spineAreaHeight - 8}" fill="${fill}" font-family="sans-serif" font-size="6" text-anchor="middle">STEAM</text></g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}"><rect width="${options.width}" height="${options.height}" fill="#2b1d14"/><g>${spines}</g><rect y="${options.height - shelfHeight}" width="${options.width}" height="${shelfHeight}" fill="#1a120c"/><rect y="${options.height - shelfHeight - 2}" width="${options.width}" height="2" fill="#00000055"/></svg>`;
}
