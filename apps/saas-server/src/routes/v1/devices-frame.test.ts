import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { buildApp } from '../../app.js';
import { hashDeviceToken } from '../../lib/device-auth.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createAuthService } from '../../services/auth-service.js';

vi.mock('@digital-shelf-saas/renderer', () => ({
  renderFrame: vi.fn(async () => ({
    png: Buffer.from('png-bytes'),
    rgb565: Buffer.from('rgb565-bytes'),
    width: 172,
    height: 320,
  })),
}));

const prisma = new PrismaClient();
let app: FastifyInstance;
let frameRoot: string;

const auth = createAuthService(prisma, {
  sessionTtlDays: 30,
  mobileAccessTtlMinutes: 60,
  mobileRefreshTtlDays: 30,
  mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
});

async function cleanDb() {
  await prisma.displayFrame.deleteMany();
  await prisma.deviceConfig.deleteMany();
  await prisma.device.deleteMany();
  await prisma.userGame.deleteMany();
  await prisma.game.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.platformAccount.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUser(suffix: string, subscribed = true) {
  const user = await prisma.user.create({
    data: { id: createId('user'), steamId64: `${Date.now()}76561198000000${suffix}` },
  });
  if (subscribed) {
    await prisma.subscription.create({
      data: {
        id: createId('sub'),
        userId: user.id,
        planId: 'plan_pro',
        provider: 'paypal',
        status: 'active',
        billingCycle: 'monthly',
      },
    });
  }
  return user;
}

async function seedDevice(userId: string, token = `dev-token-${userId}`) {
  const device = await prisma.device.create({
    data: {
      id: createId('device'),
      userId,
      name: 'Shelf',
      hardwareId: `hw-${userId}-${Date.now()}`,
      tokenHash: hashDeviceToken(token),
      screenWidth: 172,
      screenHeight: 320,
    },
  });
  await prisma.deviceConfig.create({
    data: {
      deviceId: device.id,
      gamesPerFrame: 1,
      rotationIntervalSeconds: 300,
      selectionMode: 'random',
      showPublisher: true,
      showPlaytime: false,
      avoidRecentRepeats: false,
    },
  });
  return { device, token };
}

async function seedLibrary(userId: string) {
  const account = await prisma.platformAccount.create({
    data: {
      id: createId('platformAccount'),
      userId,
      platform: 'steam',
      externalId: `steam-${userId}`,
    },
  });
  const game = await prisma.game.create({
    data: {
      id: createId('game'),
      platform: 'steam',
      externalId: `game-${userId}`,
      name: 'Frame Game',
      developers: [],
      publishers: ['Frame Pub'],
      accentColor: '#202020',
      spineTextColor: 'white',
    },
  });
  await prisma.userGame.create({
    data: {
      id: createId('userGame'),
      gameId: game.id,
      platformAccountId: account.id,
      hidden: false,
      favorite: false,
      playtimeMinutes: 10,
    },
  });
}

describe('frame routes', () => {
  beforeAll(async () => {
    frameRoot = await mkdtemp(path.join(os.tmpdir(), 'saas-frame-route-'));
    process.env.FRAME_STORAGE_DRIVER = 'local';
    process.env.FRAME_STORAGE_PATH = frameRoot;
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
    await prisma.$disconnect();
    await rm(frameRoot, { recursive: true, force: true });
  });

  it('requires web auth for frame generation route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/dev_missing/frame',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('requires active entitlement for frame generation route', async () => {
    const user = await seedUser('10', false);
    const { device } = await seedDevice(user.id);
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${device.id}/frame`,
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'SUBSCRIPTION_REQUIRED' } });
  });

  it('rejects web frame generation for another user device', async () => {
    const userA = await seedUser('20');
    const userB = await seedUser('21');
    const { device } = await seedDevice(userB.id);
    await seedLibrary(userB.id);
    const session = await auth.createWebSession(userA.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${device.id}/frame`,
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'DEVICE_NOT_FOUND' } });
  });

  it('returns frame summary for owned web device', async () => {
    const user = await seedUser('30');
    const { device } = await seedDevice(user.id);
    await seedLibrary(user.id);
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${device.id}/frame?force=true`,
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      deviceId: device.id,
      width: 172,
      height: 320,
      cached: false,
      downloadUrls: {
        png: expect.stringContaining(`/api/v1/devices/${device.id}/frames/`),
        rgb565: expect.stringContaining(`/api/v1/devices/${device.id}/frames/`),
      },
    });

    const pngResponse = await app.inject({
      method: 'GET',
      url: response.json().downloadUrls.png as string,
      cookies: { [SESSION_COOKIE]: session.id },
    });
    expect(pngResponse.statusCode).toBe(200);
    expect(pngResponse.headers['content-type']).toContain('image/png');
    expect(pngResponse.body).toBe('png-bytes');
  });

  it('requires active entitlement for device frame manifest', async () => {
    const user = await seedUser('35', false);
    const { token } = await seedDevice(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/device/v1/frame-manifest',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'SUBSCRIPTION_REQUIRED' } });
  });

  it('returns device frame manifest and blocks another device from downloading frame bytes', async () => {
    const user = await seedUser('40');
    const { device, token } = await seedDevice(user.id, 'device-token-a');
    const { token: otherToken } = await seedDevice(user.id, 'device-token-b');
    await seedLibrary(user.id);

    const manifestResponse = await app.inject({
      method: 'GET',
      url: '/api/device/v1/frame-manifest',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.json()).toMatchObject({
      mode: 'bitmap',
      format: 'rgb565',
      width: 172,
      height: 320,
      downloadUrl: expect.stringContaining('/api/device/v1/frames/'),
    });

    const frameId = manifestResponse.json().frameId as string;
    const wrongDeviceResponse = await app.inject({
      method: 'GET',
      url: `/api/device/v1/frames/${frameId}.rgb565`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(wrongDeviceResponse.statusCode).toBe(404);
    expect(wrongDeviceResponse.json()).toMatchObject({ error: { code: 'FRAME_NOT_FOUND' } });

    const ownerResponse = await app.inject({
      method: 'GET',
      url: `/api/device/v1/frames/${frameId}.rgb565`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.body).toBe('rgb565-bytes');
    expect(device.id).toBeTruthy();
  });
});
