import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import * as platformSteam from '@digital-shelf-saas/platform-steam';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';

describe('Steam auth routes', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
  });

  beforeAll(async () => {
    process.env.STEAM_API_KEY = 'test-key';
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('redirects to login with STEAM_ACCOUNT_REQUIRED when the callback has no completion token', async () => {
    const usersBefore = await prisma.user.count();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/steam/callback?openid.mode=id_res',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login?error=STEAM_ACCOUNT_REQUIRED');
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('redirects to the mobile deep link with STEAM_ACCOUNT_REQUIRED for a bare mobile callback', async () => {
    const usersBefore = await prisma.user.count();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/steam/mobile-callback?openid.mode=id_res',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'digitalshelf://auth/callback?error=STEAM_ACCOUNT_REQUIRED',
    );
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('consumes completion token and activates account on steam callback', async () => {
    const steamId64 = `${Date.now()}76561198000000099`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-pending-steam@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
    });
    const token = await auth.createCompletionToken(user.id, 'account_activation');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(steamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=account_activation&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('digitalshelf://auth/callback');

    const platformAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'steam' } },
    });
    expect(platformAccount.externalId).toBe(steamId64);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });

  it('redirects with STEAM_ID_OWNED and preserves the original owner when the steam id is already linked', async () => {
    const steamId64 = `${Date.now()}76561198000000222`;
    const owner = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-owner@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
      },
    });
    await prisma.platformAccount.create({
      data: { id: createId('platformAccount'), userId: owner.id, platform: 'steam', externalId: steamId64 },
    });
    const intruder = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-intruder@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
    });
    const token = await auth.createCompletionToken(intruder.id, 'account_activation');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(steamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=account_activation&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login?error=STEAM_ID_OWNED');

    const ownerAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: owner.id, platform: 'steam' } },
    });
    expect(ownerAccount.externalId).toBe(steamId64);
    expect(await prisma.platformAccount.findMany({ where: { userId: intruder.id } })).toHaveLength(0);

    await prisma.platformAccount.deleteMany({ where: { userId: owner.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: intruder.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
    vi.restoreAllMocks();
  });

  it('relink keeps subscription and clears steam-derived library data', async () => {
    const previousSteamId64 = `${Date.now()}76561198000000088`;
    const nextSteamId64 = `${Date.now()}76561198000000777`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-relink@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: previousSteamId64,
      },
    });
    await prisma.subscription.create({
      data: {
        id: createId('sub'),
        userId: user.id,
        planId: 'plan_basic',
        provider: 'paypal',
        status: 'active',
        billingCycle: 'monthly',
      },
    });
    await prisma.syncRun.create({
      data: {
        id: createId('sync'),
        platformAccountId: platformAccount.id,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    const token = await auth.createCompletionToken(user.id, 'steam_relink');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(nextSteamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=steam_relink&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).not.toBeNull();
    const relinkedAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'steam' } },
    });
    expect(relinkedAccount.externalId).toBe(nextSteamId64);
    expect(
      await prisma.syncRun.count({ where: { platformAccount: { userId: user.id } } }),
    ).toBe(0);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });
});
