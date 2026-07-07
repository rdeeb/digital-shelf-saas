import { createHash, createHmac } from 'node:crypto';
import type { FrameExtension, FrameStorage } from './index.js';

type CommandInput = Record<string, unknown>;

export class PutObjectCommand {
  constructor(readonly input: CommandInput) {}
}

export class GetObjectCommand {
  constructor(readonly input: CommandInput) {}
}

export interface S3LikeClient {
  send(command: PutObjectCommand | GetObjectCommand): Promise<unknown>;
}

export interface S3FrameStorageOptions {
  bucket: string;
  client: S3LikeClient;
}

export interface FetchS3ClientOptions {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function assertSafeFrameId(frameId: string): void {
  const safeId = frameId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeId !== frameId) {
    throw new Error('Invalid frame ID');
  }
}

function frameKey(frameId: string, extension: FrameExtension | 'json'): string {
  assertSafeFrameId(frameId);
  return `${frameId}/${frameId}.${extension}`;
}

function objectBase(frameId: string): string {
  assertSafeFrameId(frameId);
  return `${frameId}/${frameId}`;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (body && typeof body === 'object' && 'arrayBuffer' in body) {
    const arrayBuffer = await (body as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new Error('S3 object body is not readable');
}

export function createS3FrameStorage(options: S3FrameStorageOptions): FrameStorage {
  return {
    async saveFrame(frameId, files) {
      await options.client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: frameKey(frameId, 'png'),
          Body: files.png,
          ContentType: 'image/png',
        }),
      );
      await options.client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: frameKey(frameId, 'rgb565'),
          Body: files.rgb565,
          ContentType: 'application/octet-stream',
        }),
      );
      await options.client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: frameKey(frameId, 'json'),
          Body: Buffer.from(JSON.stringify(files.metadata, null, 2)),
          ContentType: 'application/json',
        }),
      );
      return objectBase(frameId);
    },

    async readFrameFile(frameId, extension) {
      const result = await options.client.send(
        new GetObjectCommand({
          Bucket: options.bucket,
          Key: frameKey(frameId, extension),
        }),
      );
      return bodyToBuffer((result as { Body?: unknown }).Body);
    },
  };
}

function hashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function formatAmzDate(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodePath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function signedHeaders(headers: Headers): string {
  return [...headers.keys()].map((key) => key.toLowerCase()).sort().join(';');
}

function canonicalHeaders(headers: Headers): string {
  return [...headers.keys()]
    .map((key) => key.toLowerCase())
    .sort()
    .map((key) => `${key}:${headers.get(key)?.trim() ?? ''}\n`)
    .join('');
}

function createSignedHeaders(options: {
  method: 'GET' | 'PUT';
  url: URL;
  body: Buffer;
  contentType?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  now: Date;
}): Headers {
  const { dateStamp, amzDate } = formatAmzDate(options.now);
  const payloadHash = hashHex(options.body);
  const headers = new Headers({
    host: options.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  });
  if (options.contentType) headers.set('content-type', options.contentType);

  const credentialScope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const signedHeaderNames = signedHeaders(headers);
  const canonicalRequest = [
    options.method,
    options.url.pathname,
    options.url.searchParams.toString(),
    canonicalHeaders(headers),
    signedHeaderNames,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(
    signingKey(options.secretAccessKey, dateStamp, options.region),
    stringToSign,
  );

  headers.set(
    'authorization',
    [
      `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaderNames}`,
      `Signature=${signature}`,
    ].join(', '),
  );
  return headers;
}

export function createFetchS3Client(options: FetchS3ClientOptions): S3LikeClient {
  if (!options.endpoint) {
    throw new Error('FRAME_STORAGE_ENDPOINT is required for s3 frame storage');
  }
  if (!options.accessKeyId || !options.secretAccessKey) {
    throw new Error('FRAME_STORAGE_ACCESS_KEY and FRAME_STORAGE_SECRET_KEY are required for s3 frame storage');
  }

  const endpoint = options.endpoint.replace(/\/$/, '');
  const region = options.region ?? 'us-east-1';
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async send(command) {
      const input = command.input;
      const key = String(input.Key);
      const bucket = String(input.Bucket);
      const url = new URL(`${endpoint}/${bucket}/${encodePath(key)}`);

      if (command instanceof PutObjectCommand) {
        const body = Buffer.isBuffer(input.Body)
          ? input.Body
          : Buffer.from(input.Body instanceof Uint8Array ? input.Body : String(input.Body ?? ''));
        const headers = createSignedHeaders({
          method: 'PUT',
          url,
          body,
          contentType: input.ContentType ? String(input.ContentType) : undefined,
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
          region,
          now: now(),
        });
        const response = await fetchImpl(url, { method: 'PUT', headers, body });
        if (!response.ok) throw new Error(`S3 put failed: ${response.status}`);
        return {};
      }

      const headers = createSignedHeaders({
        method: 'GET',
        url,
        body: Buffer.alloc(0),
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        region,
        now: now(),
      });
      const response = await fetchImpl(url, { method: 'GET', headers });
      if (!response.ok) throw new Error(`S3 get failed: ${response.status}`);
      return { Body: new Uint8Array(await response.arrayBuffer()) };
    },
  };
}
