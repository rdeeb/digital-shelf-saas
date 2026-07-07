import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';
import { SESSION_COOKIE } from '../../lib/session.js';

describe('GET /api/v1/auth/me', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
  });

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns authenticated user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        steamId64: `${Date.now()}76561198000000055`,
        displayName: 'Test User',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        steamId64: user.steamId64,
        displayName: 'Test User',
        avatarUrl: null,
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('GET /api/v1/onboarding/status returns subscribe next step', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000044` },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/status',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      hasActiveSubscription: false,
      hasSyncedLibrary: false,
      hasClaimedDevice: false,
      nextStep: 'subscribe',
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
