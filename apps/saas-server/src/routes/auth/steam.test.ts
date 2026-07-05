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

  it('GET /api/auth/steam/callback sets session cookie and redirects', async () => {
    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue('76561198000000099');

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/steam/callback?openid.mode=id_res',
    });

    expect(response.statusCode).toBe(302);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(cookieHeader).toContain('ds_session=');
    expect(response.headers.location).toBe('/subscribe');

    await prisma.session.deleteMany({
      where: { user: { steamId64: '76561198000000099' } },
    });
    await prisma.user.deleteMany({ where: { steamId64: '76561198000000099' } });
    vi.restoreAllMocks();
  });

  it('POST /api/auth/steam/exchange returns mobile tokens', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000088` },
    });
    const code = auth.createAuthCode(user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/steam/exchange',
      payload: { code },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
    });

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
