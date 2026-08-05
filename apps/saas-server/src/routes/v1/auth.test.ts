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

  it('returns only safe connection and method status for a fully linked user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-auth@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        displayName: 'Test User',
      },
    });
    await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: `${Date.now()}76561198000000055`,
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `${Date.now()}-google-sub`,
        email: user.email,
        emailVerifiedAt: new Date(),
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
        email: user.email,
        activationState: 'active',
        displayName: 'Test User',
        avatarUrl: null,
        steamConnected: true,
        hasPassword: true,
        authProviders: ['google'],
      },
    });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('reports no steam connection and no password for a social-only account', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-social@example.com`,
        passwordHash: null,
        activationState: 'pending_activation',
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
        email: user.email,
        activationState: 'pending_activation',
        displayName: null,
        avatarUrl: null,
        steamConnected: false,
        hasPassword: false,
        authProviders: [],
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('GET /api/v1/onboarding/status returns subscribe next step', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-onboarding@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
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
      activationState: 'pending_activation',
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
