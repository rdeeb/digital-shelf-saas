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
});
