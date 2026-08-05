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

  it('auto-links a new subject when the verified email uniquely matches an existing user with a verified email', async () => {
    const email = `${Date.now()}-autolink@example.com`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email,
        passwordHash: 'existing-hash',
        activationState: 'active',
        emailVerifiedAt: new Date(),
      },
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

  it('does not auto-link a new provider subject onto a password-registered user whose own email is unverified', async () => {
    const email = `${Date.now()}-unverified-owner@example.com`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email,
        passwordHash: 'existing-hash',
        activationState: 'pending_activation',
        emailVerifiedAt: null,
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `hijack-sub-${Date.now()}`,
      email,
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'unverified_email' });
    const identity = await prisma.authIdentity.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
    });
    expect(identity).toBeNull();

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

  it('does not auto-link when the matched user already has a different identity for the provider', async () => {
    const email = `${Date.now()}-already-has-google@example.com`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email,
        passwordHash: null,
        activationState: 'active',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `original-sub-${Date.now()}`,
        email,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `impostor-sub-${Date.now()}`,
      email,
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'provider_already_linked' });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns collision when linking mode targets a user who already has a different subject for the provider', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-existing-google@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `first-sub-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `second-sub-${Date.now()}`,
      email: null,
      emailVerified: false,
      userId: user.id,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'provider_already_linked' });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('never moves a provider subject from one user to another', async () => {
    const subject = `owned-sub-${Date.now()}`;
    const userA = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-owner@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: userA.id,
        provider: 'apple',
        providerSubject: subject,
        email: null,
        emailVerifiedAt: null,
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-intruder@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: subject,
      email: null,
      emailVerified: false,
      userId: userB.id,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'subject_owned_by_other_user' });
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_providerSubject: { provider: 'apple', providerSubject: subject } },
    });
    expect(identity.userId).toBe(userA.id);

    await prisma.authIdentity.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('converges concurrent first-login attempts for the same subject on a single account', async () => {
    const subject = `concurrent-sub-${Date.now()}`;
    const email = `${Date.now()}-concurrent@example.com`;

    const [resultA, resultB] = await Promise.all([
      service.resolveOrLinkProviderIdentity({
        provider: 'google',
        providerSubject: subject,
        email,
        emailVerified: true,
      }),
      service.resolveOrLinkProviderIdentity({
        provider: 'google',
        providerSubject: subject,
        email,
        emailVerified: true,
      }),
    ]);

    const userIds = new Set(
      [resultA, resultB].map((result) => ('userId' in result ? result.userId : null)),
    );
    expect(userIds.size).toBe(1);
    expect(userIds.has(null)).toBe(false);

    const userId = [...userIds][0] as string;
    const identities = await prisma.authIdentity.findMany({
      where: { provider: 'google', providerSubject: subject },
    });
    expect(identities).toHaveLength(1);
    const users = await prisma.user.findMany({ where: { id: userId } });
    expect(users).toHaveLength(1);

    await prisma.authIdentity.deleteMany({ where: { providerSubject: subject } });
    await prisma.user.delete({ where: { id: userId } });
  });
});
