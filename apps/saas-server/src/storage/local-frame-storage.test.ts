import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLocalFrameStorage,
  resolveFramePath,
} from './local-frame-storage.js';
import { createFrameStorage } from './index.js';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'saas-frame-storage-'));
  tempDirs.push(dir);
  return dir;
}

describe('local-frame-storage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('resolves frame paths under storage root', () => {
    const root = path.resolve('/tmp/frames');
    const resolved = resolveFramePath(root, 'frame_abc123', 'png');
    expect(resolved).toBe(path.join(root, 'frame_abc123', 'frame_abc123.png'));
  });

  it('rejects path traversal in frame id', () => {
    const root = path.resolve('/tmp/frames');
    expect(() => resolveFramePath(root, '../etc/passwd', 'png')).toThrow('Invalid frame ID');
  });

  it('saves and reads frame files by id and extension', async () => {
    const root = await makeTempDir();
    const storage = createLocalFrameStorage(root);

    const storagePath = await storage.saveFrame('frame_saved', {
      png: Buffer.from('png-bytes'),
      rgb565: Buffer.from('rgb565-bytes'),
      metadata: { frameId: 'frame_saved' },
    });

    expect(storagePath).toBe('frame_saved/frame_saved');
    await expect(readFile(path.join(root, 'frame_saved', 'frame_saved.json'), 'utf8')).resolves.toContain(
      '"frameId": "frame_saved"',
    );
    await expect(storage.readFrameFile('frame_saved', 'rgb565')).resolves.toEqual(
      Buffer.from('rgb565-bytes'),
    );
  });

  it('factory creates local storage for local driver', async () => {
    const root = await makeTempDir();
    const storage = createFrameStorage({
      FRAME_STORAGE_DRIVER: 'local',
      FRAME_STORAGE_PATH: root,
      FRAME_STORAGE_BUCKET: '',
      FRAME_STORAGE_ENDPOINT: '',
      FRAME_STORAGE_ACCESS_KEY: '',
      FRAME_STORAGE_SECRET_KEY: '',
    });

    const storagePath = await storage.saveFrame('frame_factory', {
      png: Buffer.from('png'),
      rgb565: Buffer.from('rgb565'),
      metadata: {},
    });

    expect(storagePath).toBe('frame_factory/frame_factory');
    await expect(storage.readFrameFile('frame_factory', 'png')).resolves.toEqual(Buffer.from('png'));
  });
});
