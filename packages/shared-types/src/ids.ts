import { nanoid } from 'nanoid';

export const ID_PREFIX = {
  game: 'game',
  userGame: 'ug',
  platformAccount: 'plat',
  device: 'dev',
  frame: 'frame',
  sync: 'sync',
  metadata: 'meta',
} as const;

export type IdPrefix = keyof typeof ID_PREFIX;

export function createId(prefix: IdPrefix): string {
  return `${ID_PREFIX[prefix]}_${nanoid()}`;
}
