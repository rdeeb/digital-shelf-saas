import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, Session, User } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { generateToken, hashToken } from '../lib/crypto.js';

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

export function createAuthService(prisma: PrismaClient, config: AuthServiceConfig) {
  return {
    async upsertUserBySteamId64(steamId64: string): Promise<User> {
      return prisma.user.upsert({
        where: { steamId64 },
        create: { id: createId('user'), steamId64 },
        update: {},
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
