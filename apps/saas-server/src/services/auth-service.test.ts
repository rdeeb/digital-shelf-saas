import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { createAuthService } from './auth-service.js';

describe('auth-service', () => {
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates session for user', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000000` },
    });
    const session = await auth.createWebSession(user.id);
    expect(session.id).toMatch(/^sess_/);
    expect(session.userId).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('resolves web session to user', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000001` },
    });
    const session = await auth.createWebSession(user.id);
    const resolved = await auth.resolveWebSession(session.id);
    expect(resolved?.id).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('issues and resolves mobile access token', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: `${Date.now()}76561198000000002` },
    });
    const tokens = await auth.createMobileTokens(user.id);
    const resolved = await auth.resolveAccessToken(tokens.accessToken);
    expect(resolved?.id).toBe(user.id);
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
