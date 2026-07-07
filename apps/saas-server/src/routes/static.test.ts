import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

const publicDir = path.resolve(process.cwd(), 'public');
const indexPath = path.join(publicDir, 'index.html');
const assetPath = path.join(publicDir, 'asset.txt');

describe('static SPA routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(publicDir, { recursive: true });
    await writeFile(indexPath, '<!doctype html><div id="root"></div>', 'utf8');
    await writeFile(assetPath, 'asset-ok', 'utf8');
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await rm(indexPath, { force: true });
    await rm(assetPath, { force: true });
  });

  it('serves built assets and falls back browser routes to the SPA', async () => {
    const asset = await app.inject({ method: 'GET', url: '/asset.txt' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe('asset-ok');

    const page = await app.inject({ method: 'GET', url: '/library' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<div id="root"></div>');

    const apiMissing = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(apiMissing.statusCode).toBe(404);
    expect(apiMissing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
