import { afterAll, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { createAuthService, SteamIdOwnedError } from './auth-service.js';

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

  async function createUser(overrides: Partial<User> = {}) {
    return prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-${Math.random()}@example.com`,
        passwordHash: 'placeholder-password-hash',
        activationState: 'active',
        ...overrides,
      },
    });
  }

  async function linkSteamAccount(userId: string, externalId: string) {
    return prisma.platformAccount.create({
      data: { id: createId('platformAccount'), userId, platform: 'steam', externalId },
    });
  }

  it('creates session for user', async () => {
    const user = await createUser();
    const session = await auth.createWebSession(user.id);
    expect(session.id).toMatch(/^sess_/);
    expect(session.userId).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('resolves web session to user', async () => {
    const user = await createUser();
    const session = await auth.createWebSession(user.id);
    const resolved = await auth.resolveWebSession(session.id);
    expect(resolved?.id).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('issues and resolves mobile access token', async () => {
    const user = await createUser();
    const tokens = await auth.createMobileTokens(user.id);
    const resolved = await auth.resolveAccessToken(tokens.accessToken);
    expect(resolved?.id).toBe(user.id);
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns completion-required for password login without a linked steam account', async () => {
    const user = await createUser({
      email: `${Date.now()}-pending@example.com`,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'pending_activation',
    });

    const result = await auth.loginWithPassword(user.email, 'hunter2');

    expect(result).toEqual({
      kind: 'completion_required',
      userId: user.id,
      completionToken: expect.any(String),
    });

    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('creates full tokens for active accounts with a linked steam platform account', async () => {
    const user = await createUser({
      email: `${Date.now()}-active@example.com`,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'active',
    });
    await linkSteamAccount(user.id, `${Date.now()}76561198000000123`);

    const result = await auth.loginWithPassword(user.email, 'hunter2');
    expect(result.kind).toBe('authenticated');

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns the same invalid-credentials error for a social-only account as for an unknown email', async () => {
    const socialUser = await createUser({
      email: `${Date.now()}-social-only@example.com`,
      passwordHash: null,
      activationState: 'pending_activation',
    });

    await expect(auth.loginWithPassword(socialUser.email, 'anything')).rejects.toThrow(
      'INVALID_CREDENTIALS',
    );
    await expect(
      auth.loginWithPassword(`${Date.now()}-does-not-exist@example.com`, 'anything'),
    ).rejects.toThrow('INVALID_CREDENTIALS');

    await prisma.user.delete({ where: { id: socialUser.id } });
  });

  it('normalizes email case and surrounding whitespace on login', async () => {
    const email = `${Date.now()}-normalize@example.com`;
    const user = await createUser({
      email,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'active',
    });
    await linkSteamAccount(user.id, `${Date.now()}76561198000000456`);

    const result = await auth.loginWithPassword(`  ${email.toUpperCase()}  `, 'hunter2');
    expect(result.kind).toBe('authenticated');

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('activation creates exactly one tenant-scoped steam platform account', async () => {
    const user = await createUser({
      email: `${Date.now()}-activate@example.com`,
      activationState: 'pending_activation',
    });
    const steamId64 = `${Date.now()}76561198000000789`;

    const activated = await auth.activateAccountWithSteam(user.id, steamId64);
    expect(activated.activationState).toBe('active');

    const accounts = await prisma.platformAccount.findMany({
      where: { userId: user.id, platform: 'steam' },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].externalId).toBe(steamId64);

    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('fails closed and preserves the original owner when a steam id is already linked', async () => {
    const owner = await createUser({ email: `${Date.now()}-owner@example.com` });
    const steamId64 = `${Date.now()}76561198000000999`;
    await linkSteamAccount(owner.id, steamId64);

    const intruder = await createUser({
      email: `${Date.now()}-intruder@example.com`,
      activationState: 'pending_activation',
    });

    await expect(auth.activateAccountWithSteam(intruder.id, steamId64)).rejects.toThrow(
      SteamIdOwnedError,
    );

    const ownerAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: owner.id, platform: 'steam' } },
    });
    expect(ownerAccount.externalId).toBe(steamId64);
    const intruderAccounts = await prisma.platformAccount.findMany({ where: { userId: intruder.id } });
    expect(intruderAccounts).toHaveLength(0);
    const refreshedIntruder = await prisma.user.findUniqueOrThrow({ where: { id: intruder.id } });
    expect(refreshedIntruder.activationState).toBe('pending_activation');

    await prisma.platformAccount.deleteMany({ where: { userId: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  });
});
