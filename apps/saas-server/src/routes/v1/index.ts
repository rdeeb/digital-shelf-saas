import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db/client.js';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { clearSessionCookie } from '../../lib/session.js';
import { createEntitlementService } from '../../middleware/entitlement.js';
import { registerAuthPlugin } from '../../middleware/auth.js';

export async function registerV1AuthRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/auth/me', async (request, reply) => {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: request.userId! },
        });
        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            steamId64: user.steamId64,
            activationState: user.activationState,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        });
      });

      protectedApp.post('/auth/logout', async (request, reply) => {
        const sessionId = request.cookies.ds_session;
        if (sessionId) {
          await auth.deleteWebSession(sessionId);
        }
        clearSessionCookie(reply);
        return reply.send({ ok: true });
      });
    },
    { prefix: '/api/v1' },
  );
}

export async function registerV1OnboardingRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();
  const entitlement = createEntitlementService(prisma);

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/onboarding/status', async (request, reply) => {
        const userId = request.userId!;
        const hasActiveSubscription = await entitlement.hasActiveSubscription(userId);

        const platformAccount = await prisma.platformAccount.findFirst({ where: { userId } });
        const hasSyncedLibrary = platformAccount
          ? !!(await prisma.syncRun.findFirst({
              where: { platformAccountId: platformAccount.id, status: 'completed' },
            }))
          : false;

        const hasClaimedDevice = !!(await prisma.device.findFirst({
          where: { userId, tokenHash: { not: '' } },
        }));

        let nextStep: 'subscribe' | 'sync' | 'devices' | 'dashboard' = 'subscribe';
        if (hasActiveSubscription) {
          nextStep = hasSyncedLibrary ? (hasClaimedDevice ? 'dashboard' : 'devices') : 'sync';
        }

        return reply.send({
          activationState: (
            await prisma.user.findUniqueOrThrow({
              where: { id: userId },
              select: { activationState: true },
            })
          ).activationState,
          hasActiveSubscription,
          hasSyncedLibrary,
          hasClaimedDevice,
          nextStep,
        });
      });
    },
    { prefix: '/api/v1' },
  );
}
