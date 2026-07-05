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
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000033` },
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
});
