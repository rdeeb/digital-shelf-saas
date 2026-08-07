import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';
import { SESSION_COOKIE } from '../../lib/session.js';

describe('billing routes', () => {
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

  it('GET /api/v1/billing/plans returns plans and sales flags', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-plans@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/plans',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.plans.length).toBeGreaterThanOrEqual(2);
    expect(body.salesFlags).toMatchObject({
      newEnabled: expect.any(Boolean),
      renewalsEnabled: expect.any(Boolean),
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('GET /api/v1/billing/status includes device limit fields', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-status@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
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
    await prisma.device.create({
      data: {
        id: createId('device'),
        userId: user.id,
        name: 'Kitchen',
        hardwareId: `hw-billing-status-${Date.now()}`,
        tokenHash: 'claimed-token-hash',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/status',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      subscription: { planId: 'plan_basic', status: 'active' },
      deviceLimit: 1,
      canClaimDevice: false,
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.delete({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects subscription creation when steam is not linked', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-no-steam@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/paypal/subscribe',
      cookies: { [SESSION_COOKIE]: session.id },
      payload: { planId: 'plan_basic', billingCycle: 'monthly' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'STEAM_LINK_REQUIRED' },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
