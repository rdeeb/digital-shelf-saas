import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { buildApp } from '../app.js';
import { hashDeviceToken } from '../lib/device-auth.js';
import { SESSION_COOKIE } from '../lib/session.js';
import { createAuthService } from '../services/auth-service.js';

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

async function seedUser(suffix: string) {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-${suffix}@test.local`,
      passwordHash: 'test-hash',
      activationState: 'active',
      steamId64: `${Date.now()}76561198000000${suffix}`,
    },
  });
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
  return user;
}

async function seedDevice(userId: string, suffix: string) {
  const token = `device-token-${suffix}`;
  const device = await prisma.device.create({
    data: {
      id: createId('device'),
      userId,
      name: `Shelf ${suffix}`,
      hardwareId: `hw-${suffix}-${Date.now()}`,
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

async function seedLibrary(userId: string, suffix: string) {
  const account = await prisma.platformAccount.create({
    data: {
      id: createId('platformAccount'),
      userId,
      platform: 'steam',
      externalId: `steam-${suffix}`,
    },
  });
  const game = await prisma.game.create({
    data: {
      id: createId('game'),
      platform: 'steam',
      externalId: `game-${suffix}`,
      name: `Game ${suffix}`,
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

describe('tenant isolation integration', () => {
  beforeAll(async () => {
    frameRoot = await mkdtemp(path.join(os.tmpdir(), 'saas-tenant-isolation-'));
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

  it('blocks user A from reading, patching, or rendering user B device', async () => {
    const userA = await seedUser('a');
    const userB = await seedUser('b');
    const { device: deviceA } = await seedDevice(userA.id, 'a');
    const { device: deviceB } = await seedDevice(userB.id, 'b');
    await seedLibrary(userA.id, 'a');
    await seedLibrary(userB.id, 'b');
    const sessionA = await auth.createWebSession(userA.id);

    const ownGet = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${deviceA.id}`,
      cookies: { [SESSION_COOKIE]: sessionA.id },
    });
    expect(ownGet.statusCode).toBe(200);
    expect(ownGet.json()).toMatchObject({ id: deviceA.id, name: 'Shelf a' });

    const crossGet = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${deviceB.id}`,
      cookies: { [SESSION_COOKIE]: sessionA.id },
    });
    expect(crossGet.statusCode).toBe(404);
    expect(crossGet.json()).toMatchObject({ error: { code: 'DEVICE_NOT_FOUND' } });

    const crossPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${deviceB.id}/config`,
      cookies: { [SESSION_COOKIE]: sessionA.id },
      payload: { gamesPerFrame: 2 },
    });
    expect(crossPatch.statusCode).toBe(404);
    expect(crossPatch.json()).toMatchObject({ error: { code: 'DEVICE_NOT_FOUND' } });

    const crossFrame = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${deviceB.id}/frame?force=true`,
      cookies: { [SESSION_COOKIE]: sessionA.id },
    });
    expect(crossFrame.statusCode).toBe(404);
    expect(crossFrame.json()).toMatchObject({ error: { code: 'DEVICE_NOT_FOUND' } });

    const ownFrame = await app.inject({
      method: 'GET',
      url: `/api/v1/devices/${deviceA.id}/frame?force=true`,
      cookies: { [SESSION_COOKIE]: sessionA.id },
    });
    expect(ownFrame.statusCode).toBe(200);
    expect(ownFrame.json()).toMatchObject({ deviceId: deviceA.id, cached: false });
  });
});
