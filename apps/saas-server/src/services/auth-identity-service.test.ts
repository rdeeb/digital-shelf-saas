import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { createAuthIdentityService } from './auth-identity-service.js';

describe('auth-identity-service', () => {
  const prisma = new PrismaClient();
  const service = createAuthIdentityService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves the original user by provider subject even when the provider email changes', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-subject-stable@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    const subject = `stable-sub-${Date.now()}`;
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: subject,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: subject,
      email: 'a-completely-different-email@example.com',
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'resolved', userId: user.id });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('auto-links a new subject when the verified email uniquely matches an existing user', async () => {
    const email = `${Date.now()}-autolink@example.com`;
    const user = await prisma.user.create({
      data: { id: createId('user'), email, passwordHash: 'existing-hash', activationState: 'active' },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `new-sub-${Date.now()}`,
      email: `  ${email.toUpperCase()}  `,
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'linked', userId: user.id, created: true });
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
    });
    expect(identity.email).toBe(email);

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('does not auto-link when the provider email is missing or unverified', async () => {
    const missingEmailResult = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `missing-email-sub-${Date.now()}`,
      email: null,
      emailVerified: false,
    });
    expect(missingEmailResult).toEqual({ kind: 'collision', reason: 'missing_email' });

    const unverifiedResult = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `unverified-sub-${Date.now()}`,
      email: `${Date.now()}-unverified@example.com`,
      emailVerified: false,
    });
    expect(unverifiedResult).toEqual({ kind: 'collision', reason: 'unverified_email' });
  });

  it('creates a new social-only account when no existing user matches the verified email', async () => {
    const email = `${Date.now()}-brand-new@example.com`;

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `brand-new-sub-${Date.now()}`,
      email,
      emailVerified: true,
    });

    expect(result.kind).toBe('created');
    const userId = (result as { kind: 'created'; userId: string }).userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBeNull();
    expect(user.activationState).toBe('pending_activation');

    await prisma.authIdentity.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });
});
