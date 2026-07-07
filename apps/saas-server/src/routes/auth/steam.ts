import {
  buildSteamOpenIdLoginUrl,
  verifySteamOpenIdCallback,
} from '@digital-shelf-saas/platform-steam';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadEnv } from '../../config/env.js';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js';
import type { AuthService } from '../../services/auth-service.js';

function buildOpenIdUrls(publicUrl: string) {
  const normalized = publicUrl.replace(/\/$/, '');
  return {
    realm: normalized,
    returnTo: `${normalized}/api/auth/steam/callback`,
  };
}

function queryToRecord(query: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

async function resolvePostLoginRedirect(userId: string): Promise<string> {
  const { prisma } = await import('../../db/client.js');
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription || subscription.status !== 'active') {
    return '/subscribe';
  }
  const platformAccount = await prisma.platformAccount.findFirst({ where: { userId } });
  if (!platformAccount) {
    return '/onboarding/sync';
  }
  const syncRun = await prisma.syncRun.findFirst({
    where: { platformAccountId: platformAccount.id, status: 'completed' },
  });
  if (!syncRun) {
    return '/onboarding/sync';
  }
  const claimedDevice = await prisma.device.findFirst({
    where: { userId, tokenHash: { not: '' } },
  });
  if (!claimedDevice) {
    return '/devices';
  }
  return '/dashboard';
}

export async function registerSteamAuthRoutes(
  app: FastifyInstance,
  deps: { auth?: AuthService } = {},
): Promise<void> {
  const env = loadEnv();
  const auth = deps.auth ?? createAuthServiceFromEnv();

  app.get('/api/auth/steam/login', async (request, reply) => {
    if (!env.STEAM_API_KEY) {
      return reply.status(503).send({
        error: {
          code: 'STEAM_API_KEY_MISSING',
          message: 'Steam integration is not configured.',
        },
      });
    }

    const client = (request.query as { client?: string }).client;
    const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
    const effectiveReturnTo =
      client === 'mobile'
        ? returnTo.replace('/callback', '/mobile-callback')
        : returnTo;
    const loginUrl = buildSteamOpenIdLoginUrl({ returnTo: effectiveReturnTo, realm });
    return reply.redirect(loginUrl);
  });

  app.get('/api/auth/steam/callback', async (request, reply) => {
    try {
      const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
      const steamId64 = await verifySteamOpenIdCallback({
        query: queryToRecord(request.query as Record<string, unknown>),
        returnTo,
        realm,
      });

      const user = await auth.upsertUserBySteamId64(steamId64);
      const session = await auth.createWebSession(user.id);
      setSessionCookie(reply, session.id, 30);

      const redirectPath = await resolvePostLoginRedirect(user.id);
      return reply.redirect(redirectPath);
    } catch {
      return reply.redirect('/login?error=STEAM_OPENID_FAILED');
    }
  });

  app.get('/api/auth/steam/mobile-callback', async (request, reply) => {
    try {
      const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
      const mobileReturnTo = returnTo.replace('/callback', '/mobile-callback');
      const steamId64 = await verifySteamOpenIdCallback({
        query: queryToRecord(request.query as Record<string, unknown>),
        returnTo: mobileReturnTo,
        realm,
      });

      const user = await auth.upsertUserBySteamId64(steamId64);
      const code = auth.createAuthCode(user.id);
      return reply.redirect(`digitalshelf://auth/callback?code=${encodeURIComponent(code)}`);
    } catch {
      return reply.redirect('digitalshelf://auth/callback?error=STEAM_OPENID_FAILED');
    }
  });

  const exchangeSchema = z.object({ code: z.string().min(1) });

  app.post('/api/auth/steam/exchange', async (request, reply) => {
    const parsed = exchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Invalid exchange payload.' },
      });
    }

    const userId = auth.consumeAuthCode(parsed.data.code);
    if (!userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_AUTH_CODE', message: 'Auth code is invalid or expired.' },
      });
    }

    const tokens = await auth.createMobileTokens(userId);
    return reply.send(tokens);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies.ds_session;
    if (sessionId) {
      await auth.deleteWebSession(sessionId);
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
