import { Prisma, type PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';

export type AuthProvider = 'google' | 'apple';

export type AuthIdentityResolveResult =
  | { kind: 'resolved'; userId: string }
  | { kind: 'linked'; userId: string; created: boolean }
  | { kind: 'created'; userId: string }
  | {
      kind: 'collision';
      reason:
        | 'unverified_email'
        | 'missing_email'
        | 'ambiguous_email'
        | 'provider_already_linked'
        | 'subject_owned_by_other_user';
    };

export type LinkVerifiedProviderInput = {
  provider: AuthProvider;
  providerSubject: string;
  email: string | null;
  emailVerified: boolean;
  /** When set, link to this already-authenticated user (server-derived). When unset, resolve/create by subject then verified email. */
  userId?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function createAuthIdentityService(prisma: PrismaClient) {
  async function linkToExistingUser(
    userId: string,
    provider: AuthProvider,
    providerSubject: string,
    email: string | null,
    emailVerified: boolean,
  ): Promise<AuthIdentityResolveResult> {
    const bySubject = await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider, providerSubject } },
    });
    if (bySubject) {
      return bySubject.userId === userId
        ? { kind: 'resolved', userId }
        : { kind: 'collision', reason: 'subject_owned_by_other_user' };
    }

    const byProvider = await prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (byProvider) {
      return { kind: 'collision', reason: 'provider_already_linked' };
    }

    try {
      await prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId,
          provider,
          providerSubject,
          email: email ? normalizeEmail(email) : null,
          emailVerifiedAt: emailVerified ? new Date() : null,
        },
      });
      return { kind: 'linked', userId, created: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return linkToExistingUser(userId, provider, providerSubject, email, emailVerified);
      }
      throw error;
    }
  }

  async function resolveOrCreate(
    provider: AuthProvider,
    providerSubject: string,
    email: string | null,
    emailVerified: boolean,
  ): Promise<AuthIdentityResolveResult> {
    const existing = await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider, providerSubject } },
    });
    if (existing) {
      return { kind: 'resolved', userId: existing.userId };
    }

    if (!email) {
      return { kind: 'collision', reason: 'missing_email' };
    }
    if (!emailVerified) {
      return { kind: 'collision', reason: 'unverified_email' };
    }

    const normalizedEmail = normalizeEmail(email);
    const matches = await prisma.user.findMany({ where: { email: normalizedEmail } });

    if (matches.length > 1) {
      return { kind: 'collision', reason: 'ambiguous_email' };
    }

    try {
      if (matches.length === 0) {
        const userId = createId('user');
        await prisma.$transaction([
          prisma.user.create({
            data: {
              id: userId,
              email: normalizedEmail,
              passwordHash: null,
              activationState: 'pending_activation',
            },
          }),
          prisma.authIdentity.create({
            data: {
              id: createId('authIdentity'),
              userId,
              provider,
              providerSubject,
              email: normalizedEmail,
              emailVerifiedAt: new Date(),
            },
          }),
        ]);
        return { kind: 'created', userId };
      }

      const matchedUser = matches[0];
      const alreadyLinked = await prisma.authIdentity.findUnique({
        where: { userId_provider: { userId: matchedUser.id, provider } },
      });
      if (alreadyLinked) {
        if (alreadyLinked.providerSubject === providerSubject) {
          return { kind: 'resolved', userId: matchedUser.id };
        }
        return { kind: 'collision', reason: 'provider_already_linked' };
      }

      await prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: matchedUser.id,
          provider,
          providerSubject,
          email: normalizedEmail,
          emailVerifiedAt: new Date(),
        },
      });
      return { kind: 'linked', userId: matchedUser.id, created: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return resolveOrCreate(provider, providerSubject, email, emailVerified);
      }
      throw error;
    }
  }

  return {
    async resolveOrLinkProviderIdentity(
      input: LinkVerifiedProviderInput,
    ): Promise<AuthIdentityResolveResult> {
      if (input.userId) {
        return linkToExistingUser(
          input.userId,
          input.provider,
          input.providerSubject,
          input.email,
          input.emailVerified,
        );
      }
      return resolveOrCreate(input.provider, input.providerSubject, input.email, input.emailVerified);
    },
  };
}

export type AuthIdentityService = ReturnType<typeof createAuthIdentityService>;
