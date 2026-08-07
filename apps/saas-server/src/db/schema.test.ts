import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';

describe('prisma schema', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('can query users model', async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('stores app-owned auth fields and completion tokens', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: 'player@example.com',
        passwordHash: 'hashed-password',
        emailVerifiedAt: null,
        activationState: 'pending_activation',
      },
    });

    const token = await prisma.accountCompletionToken.create({
      data: {
        id: createId('session'),
        userId: user.id,
        purpose: 'account_activation',
        tokenHash: 'token-hash',
        expiresAt: new Date(Date.now() + 300_000),
      },
    });

    expect(user.email).toBe('player@example.com');
    expect(token.purpose).toBe('account_activation');
  });

  it('creates a social-only user with a null password hash', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-social@example.com`,
        passwordHash: null,
        activationState: 'pending_activation',
      },
    });

    expect(user.passwordHash).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('attaches Google and Apple identities to the same user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dual-provider@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `google-sub-${Date.now()}`,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'apple',
        providerSubject: `apple-sub-${Date.now()}`,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });

    const identities = await prisma.authIdentity.findMany({ where: { userId: user.id } });
    expect(identities).toHaveLength(2);
    expect(identities.map((identity) => identity.provider).sort()).toEqual(['apple', 'google']);

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects duplicate provider + providerSubject across different users', async () => {
    const subject = `dup-sub-${Date.now()}`;
    const userA = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dup-a@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dup-b@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: userA.id,
        provider: 'google',
        providerSubject: subject,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await expect(
      prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: userB.id,
          provider: 'google',
          providerSubject: subject,
          email: null,
          emailVerifiedAt: null,
        },
      }),
    ).rejects.toThrow();

    await prisma.authIdentity.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('rejects two subjects for the same userId + provider', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-same-provider@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `sub-1-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await expect(
      prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: user.id,
          provider: 'google',
          providerSubject: `sub-2-${Date.now()}`,
          email: null,
          emailVerifiedAt: null,
        },
      }),
    ).rejects.toThrow();

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('cascades auth identity deletion when the user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-cascade@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `cascade-sub-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.authIdentity.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });
});
