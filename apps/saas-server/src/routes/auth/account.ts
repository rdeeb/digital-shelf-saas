import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { registerAuthPlugin } from '../../middleware/auth.js';
import { setSessionCookie } from '../../lib/session.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function buildSteamRelinkUrl(token: string): string {
  return `/api/auth/steam/login?purpose=steam_relink&token=${encodeURIComponent(token)}`;
}

export async function registerAccountAuthRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();

  app.post('/api/auth/account/signup', async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid signup payload.',
        },
      });
    }

    try {
      const user = await auth.createPendingUser(parsed.data.email, parsed.data.password);
      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          activationState: user.activationState,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return reply.status(409).send({
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account already exists for that email address.',
          },
        });
      }
      throw error;
    }
  });

  app.post('/api/auth/account/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid login payload.',
        },
      });
    }

    try {
      const result = await auth.loginWithPassword(parsed.data.email, parsed.data.password);
      if (result.kind === 'completion_required') {
        return reply.status(409).send({
          error: {
            code: 'ACCOUNT_COMPLETION_REQUIRED',
            message: 'Finish linking Steam to continue.',
          },
          completionToken: result.completionToken,
        });
      }

      const session = await auth.createWebSession(result.user.id);
      setSessionCookie(reply, session.id, 30);
      return reply.send({
        kind: 'authenticated',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
      }
      throw error;
    }
  });

  await app.register(async (protectedApp) => {
    await registerAuthPlugin(protectedApp, auth);

    protectedApp.post('/api/auth/account/steam-relink', async (request, reply) => {
      const token = await auth.createCompletionToken(request.userId!, 'steam_relink');
      return reply.send({
        relinkUrl: buildSteamRelinkUrl(token),
      });
    });
  });
}
