import type { GamesPerFrame, SpineStyle } from './enums.js';

export interface RenderGame {
  id: string;
  name: string;
  publishers: string[];
  accentColor: string;
  spineTextColor: 'white' | 'black';
  spineArtPath: string | null;
}

export interface RenderFrameOptions {
  width: number;
  height: number;
  gamesPerFrame: GamesPerFrame;
  spineStyle: SpineStyle;
  showPublisher: boolean;
  showTitle: boolean;
  artRootPath?: string;
}

export interface RenderedFrame {
  png: Buffer;
  rgb565: Buffer;
  width: number;
  height: number;
}
