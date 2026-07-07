import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';
import { SESSION_COOKIE } from '../../lib/session.js';

describe('GET/PATCH /api/v1/settings', () => {
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

  it('returns default settings', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000066` },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settings',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      display: {
        showPublisher: true,
        showPlaytime: false,
        gamesPerFrame: 3,
        rotationIntervalSeconds: 300,
        selectionMode: 'random',
        avoidRecentRepeats: true,
      },
      notifications: { emailOptIn: false },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('patches display settings', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000067` },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/settings',
      cookies: { [SESSION_COOKIE]: session.id },
      payload: { display: { gamesPerFrame: 4, showPlaytime: true } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().display.gamesPerFrame).toBe(4);
    expect(response.json().display.showPlaytime).toBe(true);

    await prisma.userSetting.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
