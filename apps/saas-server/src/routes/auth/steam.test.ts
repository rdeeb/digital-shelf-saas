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

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({
      where: { userId: user.id },
    });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });

  it('relink keeps subscription and clears steam-derived library data', async () => {
    const nextSteamId64 = `${Date.now()}76561198000000777`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-relink@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000088`,
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: user.steamId64!,
      },
    });
    await prisma.subscription.create({
      data: {
        id: createId('subscription'),
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
    expect(
      await prisma.syncRun.count({
        where: {
          platformAccount: {
            userId: user.id,
          },
        },
      }),
    ).toBe(0);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });
});
