import type { PrismaClient, User } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';

export type CreateTestUserOptions = {
  email?: string;
  passwordHash?: string | null;
  activationState?: string;
  displayName?: string | null;
  withSteam?: boolean;
  steamExternalId?: string;
};

export async function createTestUser(
  prisma: PrismaClient,
  options: CreateTestUserOptions = {},
): Promise<User> {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: options.email ?? `${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: options.passwordHash === undefined ? 'test-hash' : options.passwordHash,
      activationState: options.activationState ?? 'active',
      displayName: options.displayName ?? null,
    },
  });

  if (options.withSteam || options.steamExternalId) {
    await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId:
          options.steamExternalId ?? `${Date.now()}${Math.floor(Math.random() * 1_000_000_000)}`,
      },
    });
  }

  return user;
}
