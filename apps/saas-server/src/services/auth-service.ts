import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AccountCompletionToken, PrismaClient, Session, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { generateToken, hashToken } from '../lib/crypto.js';
import { normalizeEmail } from './auth-identity-service.js';
import { resetSteamLibraryForUser } from './steam-sync-service.js';

export type AuthServiceConfig = {
  sessionTtlDays: number;
  mobileAccessTtlMinutes: number;
  mobileRefreshTtlDays: number;
  mobileTokenSecret: string;
};

type PendingAuthCode = {
  userId: string;
  expiresAt: number;
};

const pendingAuthCodes = new Map<string, PendingAuthCode>();

export type PasswordLoginResult =
  | {
      kind: 'authenticated';
      user: User;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { kind: 'completion_required'; userId: string; completionToken: string };

export class SteamIdOwnedError extends Error {
  readonly code = 'STEAM_ID_OWNED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SteamIdOwnedError';
  }
}

type PlatformAccountDb = Pick<PrismaClient, 'platformAccount'>;

function sessionExpiresAt(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

function signAccessToken(userId: string, secret: string, ttlMinutes: number): string {
  const exp = Date.now() + ttlMinutes * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAccessToken(token: string, secret: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId: string;
      exp: number;
    };
    if (parsed.exp < Date.now()) {
      return null;
    }
    return parsed.userId;
  } catch {
    return null;
  }
}

function hashPasswordValue(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function assertSteamIdAvailable(
  db: PlatformAccountDb,
  steamId64: string,
  userId: string,
): Promise<void> {
  const ownedByOther = await db.platformAccount.findFirst({
    where: { platform: 'steam', externalId: steamId64, NOT: { userId } },
  });
  if (ownedByOther) {
    throw new SteamIdOwnedError(
      'That Steam account is already linked to another Digital Shelf account.',
    );
  }
}

async function upsertSteamPlatformAccount(
  db: PlatformAccountDb,
  userId: string,
  steamId64: string,
) {
  await assertSteamIdAvailable(db, steamId64, userId);
  try {
    return await db.platformAccount.upsert({
      where: { userId_platform: { userId, platform: 'steam' } },
      create: { id: createId('platformAccount'), userId, platform: 'steam', externalId: steamId64 },
      update: { externalId: steamId64 },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SteamIdOwnedError(
        'That Steam account is already linked to another Digital Shelf account.',
      );
    }
    throw error;
  }
}

export function createAuthService(prisma: PrismaClient, config: AuthServiceConfig) {
  return {
    async hashPassword(password: string): Promise<string> {
      return hashPasswordValue(password);
    },

    async createPendingUser(email: string, password: string): Promise<User> {
      return prisma.user.create({
        data: {
          id: createId('user'),
          email: normalizeEmail(email),
          passwordHash: hashPasswordValue(password),
          activationState: 'pending_activation',
        },
      });
    },

    async createWebSession(userId: string): Promise<Session> {
      return prisma.session.create({
        data: {
          id: createId('session'),
          userId,
          expiresAt: sessionExpiresAt(config.sessionTtlDays),
        },
      });
    },

    async resolveWebSession(sessionId: string): Promise<User | null> {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date()) {
        if (session) {
          await prisma.session.delete({ where: { id: sessionId } });
        }
        return null;
      }
      return session.user;
    },

    async deleteWebSession(sessionId: string): Promise<void> {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async createMobileTokens(
      userId: string,
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
      const accessToken = signAccessToken(
        userId,
        config.mobileTokenSecret,
        config.mobileAccessTtlMinutes,
      );
      const refreshToken = generateToken();
      await prisma.refreshToken.create({
        data: {
          id: createId('session'),
          userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: sessionExpiresAt(config.mobileRefreshTtlDays),
        },
      });
      return {
        accessToken,
        refreshToken,
        expiresIn: config.mobileAccessTtlMinutes * 60,
      };
    },

    async resolveAccessToken(token: string): Promise<User | null> {
      const userId = verifyAccessToken(token, config.mobileTokenSecret);
      if (!userId) {
        return null;
      }
      return prisma.user.findUnique({ where: { id: userId } });
    },

    async rotateRefreshToken(
      refreshToken: string,
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
      const tokenHash = hashToken(refreshToken);
      const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!existing || existing.expiresAt < new Date()) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }
      await prisma.refreshToken.delete({ where: { id: existing.id } });
      return this.createMobileTokens(existing.userId);
    },

    async createCompletionToken(userId: string, purpose: string): Promise<string> {
      const token = generateToken();
      await prisma.accountCompletionToken.create({
        data: {
          id: createId('session'),
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return token;
    },

    async assertCompletionTokenAvailable(token: string, purpose: string): Promise<AccountCompletionToken | null> {
      const existing = await prisma.accountCompletionToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!existing || existing.purpose !== purpose || existing.consumedAt || existing.expiresAt < new Date()) {
        return null;
      }
      return existing;
    },

    async consumeCompletionToken(token: string, purpose: string): Promise<AccountCompletionToken | null> {
      const existing = await prisma.accountCompletionToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!existing || existing.purpose !== purpose || existing.consumedAt || existing.expiresAt < new Date()) {
        return null;
      }
      return prisma.accountCompletionToken.update({
        where: { id: existing.id },
        data: { consumedAt: new Date() },
      });
    },

    async activateAccountWithSteam(userId: string, steamId64: string): Promise<User> {
      await prisma.$transaction(async (tx) => {
        await upsertSteamPlatformAccount(tx, userId, steamId64);
        await tx.user.update({ where: { id: userId }, data: { activationState: 'active' } });
      });
      return prisma.user.findUniqueOrThrow({ where: { id: userId } });
    },

    async relinkSteamAccount(userId: string, steamId64: string): Promise<User> {
      await prisma.$transaction(async (tx) => {
        await assertSteamIdAvailable(tx, steamId64, userId);
        await resetSteamLibraryForUser(tx, userId);
        await upsertSteamPlatformAccount(tx, userId, steamId64);
        await tx.user.update({ where: { id: userId }, data: { activationState: 'active' } });
      });

      return prisma.user.findUniqueOrThrow({ where: { id: userId } });
    },

    async loginWithPassword(email: string, password: string): Promise<PasswordLoginResult> {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user || !user.passwordHash || user.passwordHash !== hashPasswordValue(password)) {
        throw new Error('INVALID_CREDENTIALS');
      }

      const steamAccount = await prisma.platformAccount.findUnique({
        where: { userId_platform: { userId: user.id, platform: 'steam' } },
      });

      if (!steamAccount || user.activationState !== 'active') {
        const completionToken = await this.createCompletionToken(user.id, 'account_activation');
        return {
          kind: 'completion_required',
          userId: user.id,
          completionToken,
        };
      }

      const tokens = await this.createMobileTokens(user.id);
      return {
        kind: 'authenticated',
        user,
        ...tokens,
      };
    },

    createAuthCode(userId: string): string {
      const code = createId('authCode');
      pendingAuthCodes.set(code, {
        userId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return code;
    },

    consumeAuthCode(code: string): string | null {
      const entry = pendingAuthCodes.get(code);
      if (!entry) {
        return null;
      }
      pendingAuthCodes.delete(code);
      if (entry.expiresAt < Date.now()) {
        return null;
      }
      return entry.userId;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
