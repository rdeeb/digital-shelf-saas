import type { FastifyInstance } from 'fastify';
import {
  adminGamePatchSchema,
  adminGamesQuerySchema,
} from '@digital-shelf-saas/device-protocol';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { loadEnv } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { registerAuthPlugin } from '../../middleware/auth.js';
import { registerEntitlementGuard, createEntitlementService } from '../../middleware/entitlement.js';
import { createLibraryService, LibraryServiceError } from '../../services/library-service.js';
import {
  createSteamSyncService,
  SteamNotConfiguredError,
} from '../../services/steam-sync-service.js';

export async function registerV1LibraryRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();
  const env = loadEnv();
  const libraryService = createLibraryService(prisma);
  const steamSync = createSteamSyncService(prisma, { steamApiKey: env.STEAM_API_KEY });
  const entitlement = createEntitlementService(prisma);

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/library', async (request, reply) => {
        const parsed = adminGamesQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((issue) => issue.message).join('; '),
            },
          });
        }
        return libraryService.listGames(request.userId!, parsed.data);
      });

      protectedApp.patch('/library/games/:userGameId', async (request, reply) => {
        const { userGameId } = request.params as { userGameId: string };
        const parsed = adminGamePatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((issue) => issue.message).join('; '),
            },
          });
        }
        try {
          return await libraryService.updateUserGame(request.userId!, userGameId, parsed.data);
        } catch (error) {
          if (error instanceof LibraryServiceError) {
            return reply.status(error.statusCode).send({
              error: { code: error.code, message: error.message },
            });
          }
          throw error;
        }
      });
    },
    { prefix: '/api/v1' },
  );

  await app.register(
    async (entitledApp) => {
      await registerAuthPlugin(entitledApp, auth);
      await registerEntitlementGuard(entitledApp, entitlement);

      entitledApp.post('/library/sync', async (request, reply) => {
        try {
          const result = await steamSync.startSync(request.userId!);
          return reply.send(result);
        } catch (error) {
          if (error instanceof SteamNotConfiguredError) {
            return reply.status(503).send({
              error: { code: error.code, message: error.message },
            });
          }
          throw error;
        }
      });
    },
    { prefix: '/api/v1' },
  );
}
