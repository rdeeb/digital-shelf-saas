import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FrameExtension, FrameStorage } from './index.js';

export interface FrameFiles {
  png: Buffer;
  rgb565: Buffer;
  metadata: Record<string, unknown>;
}

export async function ensureFrameDir(rootPath: string): Promise<void> {
  await mkdir(rootPath, { recursive: true });
}

function assertSafeFrameId(frameId: string): void {
  const safeId = frameId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeId !== frameId) {
    throw new Error('Invalid frame ID');
  }
}

export async function saveFrame(
  rootPath: string,
  frameId: string,
  files: FrameFiles,
): Promise<string> {
  assertSafeFrameId(frameId);
  await ensureFrameDir(rootPath);
  const frameDir = path.join(rootPath, frameId);
  await mkdir(frameDir, { recursive: true });
  await writeFile(path.join(frameDir, `${frameId}.png`), files.png);
  await writeFile(path.join(frameDir, `${frameId}.rgb565`), files.rgb565);
  await writeFile(
    path.join(frameDir, `${frameId}.json`),
    JSON.stringify(files.metadata, null, 2),
  );
  return `${frameId}/${frameId}`;
}

export function resolveFramePath(
  rootPath: string,
  frameId: string,
  extension: FrameExtension,
): string {
  assertSafeFrameId(frameId);
  const resolved = path.resolve(rootPath, frameId, `${frameId}.${extension}`);
  const rootResolved = path.resolve(rootPath);
  if (!resolved.startsWith(rootResolved)) {
    throw new Error('Path traversal rejected');
  }
  return resolved;
}

export async function readFrameFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

export function createLocalFrameStorage(rootPath: string): FrameStorage {
  return {
    saveFrame: (frameId, files) => saveFrame(rootPath, frameId, files),
    readFrameFile: (frameId, extension) => readFrameFile(resolveFramePath(rootPath, frameId, extension)),
  };
}
