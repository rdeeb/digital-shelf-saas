import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../services/auth-service.js';
import { resolveRequestUserId, sendUnauthorized } from '../lib/tenant-context.js';

export async function registerAuthPlugin(
  app: FastifyInstance,
  auth: AuthService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    const userId = await resolveRequestUserId(request, auth);
    if (!userId) {
      sendUnauthorized(reply);
      return;
    }
    request.userId = userId;
  });
}
