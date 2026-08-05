import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { buildApp } from '../../app.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createAuthService } from '../../services/auth-service.js';
import { createTestUser } from '../../test-support/user-fixtures.js';

describe('account auth routes', () => {
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

  it('creates pending accounts from email and password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/account/signup',
      payload: { email: 'new@example.com', password: 'hunter2-hunter2' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: {
        email: 'new@example.com',
        activationState: 'pending_activation',
      },
    });

    await prisma.accountCompletionToken.deleteMany({
      where: { user: { email: 'new@example.com' } },
    });
    await prisma.user.deleteMany({ where: { email: 'new@example.com' } });
  });

  it('returns completion token when password login needs steam linking', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/account/signup',
      payload: { email: 'needs-steam@example.com', password: 'hunter2-hunter2' },
    });

    expect(response.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/account/login',
      payload: { email: 'needs-steam@example.com', password: 'hunter2-hunter2' },
    });

    expect(loginResponse.statusCode).toBe(409);
    expect(loginResponse.json()).toMatchObject({
      error: {
        code: 'ACCOUNT_COMPLETION_REQUIRED',
      },
      completionToken: expect.any(String),
    });

    await prisma.accountCompletionToken.deleteMany({
      where: { user: { email: 'needs-steam@example.com' } },
    });
    await prisma.user.deleteMany({ where: { email: 'needs-steam@example.com' } });
  });

  it('returns only safe token fields on successful login, never the raw user record', async () => {
    const email = `${Date.now()}-login-safe@example.com`;
    const password = 'hunter2-hunter2';
    const signupResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/account/signup',
      payload: { email, password },
    });
    expect(signupResponse.statusCode).toBe(201);
    const userId = signupResponse.json().user.id as string;

    await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId,
        platform: 'steam',
        externalId: `${Date.now()}76561198000000321`,
      },
    });
    await prisma.user.update({ where: { id: userId }, data: { activationState: 'active' } });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/account/login',
      payload: { email, password },
    });

    expect(loginResponse.statusCode).toBe(200);
    const body = loginResponse.json();
    expect(body).toEqual({
      kind: 'authenticated',
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
    expect(body).not.toHaveProperty('user');
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.platformAccount.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('issues a steam relink completion token from settings flow', async () => {
    const user = await createTestUser(prisma, { email: `${Date.now()}-active@example.com` });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/account/steam-relink',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      relinkUrl: expect.stringContaining('/api/auth/steam/login?purpose=steam_relink'),
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
