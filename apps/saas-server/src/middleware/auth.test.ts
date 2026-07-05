import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';
import { SESSION_COOKIE } from '../lib/session.js';

describe('auth middleware', () => {
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

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('accepts session cookie', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000077` },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(user.id);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('accepts bearer token', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000066` },
    });
    const tokens = await auth.createMobileTokens(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(user.id);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
