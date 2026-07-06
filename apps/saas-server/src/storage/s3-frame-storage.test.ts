import { describe, expect, it } from 'vitest';
import { createS3FrameStorage } from './s3-frame-storage.js';

interface SentCommand {
  constructor: { name: string };
  input: Record<string, unknown>;
}

function commandName(command: unknown) {
  return (command as SentCommand).constructor.name;
}

describe('s3-frame-storage', () => {
  it('uploads png, rgb565, and metadata objects under frame id prefix', async () => {
    const sent: SentCommand[] = [];
    const storage = createS3FrameStorage({
      bucket: 'frames-bucket',
      client: {
        send: async (command: unknown) => {
          sent.push(command as SentCommand);
          return {};
        },
      },
    });

    const storagePath = await storage.saveFrame('frame_s3', {
      png: Buffer.from('png'),
      rgb565: Buffer.from('rgb565'),
      metadata: { ok: true },
    });

    expect(storagePath).toBe('frame_s3/frame_s3');
    expect(sent.map(commandName)).toEqual([
      'PutObjectCommand',
      'PutObjectCommand',
      'PutObjectCommand',
    ]);
    expect(sent.map((command) => command.input)).toMatchObject([
      { Bucket: 'frames-bucket', Key: 'frame_s3/frame_s3.png', ContentType: 'image/png' },
      {
        Bucket: 'frames-bucket',
        Key: 'frame_s3/frame_s3.rgb565',
        ContentType: 'application/octet-stream',
      },
      {
        Bucket: 'frames-bucket',
        Key: 'frame_s3/frame_s3.json',
        ContentType: 'application/json',
      },
    ]);
  });

  it('reads object bodies as buffers', async () => {
    const storage = createS3FrameStorage({
      bucket: 'frames-bucket',
      client: {
        send: async (command: unknown) => {
          expect(commandName(command)).toBe('GetObjectCommand');
          expect((command as SentCommand).input).toMatchObject({
            Bucket: 'frames-bucket',
            Key: 'frame_s3/frame_s3.rgb565',
          });
          return {
            Body: {
              transformToByteArray: async () => new Uint8Array(Buffer.from('rgb565')),
            },
          };
        },
      },
    });

    await expect(storage.readFrameFile('frame_s3', 'rgb565')).resolves.toEqual(
      Buffer.from('rgb565'),
    );
  });

  it('rejects unsafe frame ids before S3 key construction', async () => {
    const storage = createS3FrameStorage({
      bucket: 'frames-bucket',
      client: { send: async () => ({}) },
    });

    await expect(
      storage.saveFrame('../bad', {
        png: Buffer.from('png'),
        rgb565: Buffer.from('rgb565'),
        metadata: {},
      }),
    ).rejects.toThrow('Invalid frame ID');
  });
});
