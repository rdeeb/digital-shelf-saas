import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export class EntitlementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}

export function createEntitlementService(prisma: PrismaClient) {
  return {
    async requireActiveSubscription(userId: string): Promise<void> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      if (!subscription || subscription.status !== 'active') {
        throw new EntitlementError(
          'SUBSCRIPTION_REQUIRED',
          'An active subscription is required.',
        );
      }
    },

    async hasActiveSubscription(userId: string): Promise<boolean> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      return subscription?.status === 'active';
    },
  };
}

export type EntitlementService = ReturnType<typeof createEntitlementService>;

export async function registerEntitlementGuard(
  app: FastifyInstance,
  entitlement: EntitlementService,
): Promise<void> {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userId) {
      return;
    }
    try {
      await entitlement.requireActiveSubscription(request.userId);
    } catch (error) {
      if (error instanceof EntitlementError) {
        return reply.status(403).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });
}
