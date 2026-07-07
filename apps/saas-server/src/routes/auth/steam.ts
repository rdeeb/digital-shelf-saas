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

function buildReturnTo(publicUrl: string, params: Record<string, string>): string {
  const callback = new URL('/api/auth/steam/callback', publicUrl);
  for (const [key, value] of Object.entries(params)) {
    callback.searchParams.set(key, value);
  }
  return callback.toString();
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

function buildMobileReturnUrl(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): string {
  const url = new URL('digitalshelf://auth/callback');
  url.searchParams.set('accessToken', tokens.accessToken);
  url.searchParams.set('refreshToken', tokens.refreshToken);
  url.searchParams.set('expiresIn', String(tokens.expiresIn));
  return url.toString();
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

    const query = request.query as { client?: string; token?: string; purpose?: string };
    const client = query.client;
    const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
    let effectiveReturnTo = client === 'mobile' ? returnTo.replace('/callback', '/mobile-callback') : returnTo;

    if (query.token && query.purpose) {
      const tokenOk = await auth.assertCompletionTokenAvailable(query.token, query.purpose);
      if (!tokenOk) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_COMPLETION_TOKEN',
            message: 'Completion token is invalid or expired.',
          },
        });
      }
      effectiveReturnTo = buildReturnTo(env.SERVER_PUBLIC_URL, {
        purpose: query.purpose,
        token: query.token,
      });
    }

    const loginUrl = buildSteamOpenIdLoginUrl({ returnTo: effectiveReturnTo, realm });
    return reply.redirect(loginUrl);
  });

  app.get('/api/auth/steam/callback', async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const purpose = typeof query.purpose === 'string' ? query.purpose : null;
      const token = typeof query.token === 'string' ? query.token : null;
      const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
      const effectiveReturnTo =
        token && purpose
          ? buildReturnTo(env.SERVER_PUBLIC_URL, { purpose, token })
          : returnTo;
      const steamId64 = await verifySteamOpenIdCallback({
        query: queryToRecord(query),
        returnTo: effectiveReturnTo,
        realm,
      });

      if (token && purpose) {
        const pending = await auth.consumeCompletionToken(token, purpose);
        if (!pending) {
          return reply.redirect('/login?error=INVALID_COMPLETION_TOKEN');
        }

        const user =
          purpose === 'steam_relink'
            ? await auth.relinkSteamAccount(pending.userId, steamId64)
            : await auth.activateAccountWithSteam(pending.userId, steamId64);
        const tokens = await auth.createMobileTokens(user.id);
        return reply.redirect(buildMobileReturnUrl(tokens));
      }

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
