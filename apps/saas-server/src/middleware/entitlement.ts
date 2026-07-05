import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createEntitlementService,
  EntitlementError,
  type EntitlementService,
} from '@digital-shelf-saas/billing';
import { prisma } from '../db/client.js';

export { EntitlementError, createEntitlementService, type EntitlementService };

export async function registerEntitlementGuard(
  app: FastifyInstance,
  entitlement: EntitlementService = createEntitlementService(prisma),
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
