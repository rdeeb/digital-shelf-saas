import path from 'node:path';
import type { Env } from '../config/env.js';
import { createLocalFrameStorage, type FrameFiles } from './local-frame-storage.js';
import { createFetchS3Client, createS3FrameStorage } from './s3-frame-storage.js';

export type FrameExtension = 'png' | 'rgb565';
export type { FrameFiles };

export interface FrameStorage {
  saveFrame(frameId: string, files: FrameFiles): Promise<string>;
  readFrameFile(frameId: string, extension: FrameExtension): Promise<Buffer>;
}

type FrameStorageEnv = Pick<
  Env,
  | 'FRAME_STORAGE_DRIVER'
  | 'FRAME_STORAGE_PATH'
  | 'FRAME_STORAGE_BUCKET'
  | 'FRAME_STORAGE_ENDPOINT'
  | 'FRAME_STORAGE_ACCESS_KEY'
  | 'FRAME_STORAGE_SECRET_KEY'
>;

export function createFrameStorage(
  env: FrameStorageEnv,
  options: { rootDir?: string } = {},
): FrameStorage {
  if (env.FRAME_STORAGE_DRIVER === 'local') {
    const rootPath = path.isAbsolute(env.FRAME_STORAGE_PATH)
      ? env.FRAME_STORAGE_PATH
      : path.resolve(options.rootDir ?? process.cwd(), env.FRAME_STORAGE_PATH);
    return createLocalFrameStorage(rootPath);
  }

  if (!env.FRAME_STORAGE_BUCKET) {
    throw new Error('FRAME_STORAGE_BUCKET is required for s3 frame storage');
  }

  return createS3FrameStorage({
    bucket: env.FRAME_STORAGE_BUCKET,
    client: createFetchS3Client({
      bucket: env.FRAME_STORAGE_BUCKET,
      endpoint: env.FRAME_STORAGE_ENDPOINT,
      accessKeyId: env.FRAME_STORAGE_ACCESS_KEY,
      secretAccessKey: env.FRAME_STORAGE_SECRET_KEY,
    }),
  });
}
