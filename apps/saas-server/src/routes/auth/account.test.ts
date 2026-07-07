import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';

describe('account auth routes', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient();

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
});
