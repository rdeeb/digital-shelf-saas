import type { FastifyInstance } from 'fastify';
import { updateUserSettingsSchema } from '@digital-shelf-saas/device-protocol';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { prisma } from '../../db/client.js';
import { registerAuthPlugin } from '../../middleware/auth.js';
import { createUserSettingsService } from '../../services/user-settings-service.js';

function toResponse(snapshot: Awaited<ReturnType<ReturnType<typeof createUserSettingsService>['getSettings']>>) {
  return {
    display: {
      showPublisher: snapshot.showPublisher,
      showPlaytime: snapshot.showPlaytime,
      gamesPerFrame: snapshot.gamesPerFrame,
      rotationIntervalSeconds: snapshot.rotationIntervalSeconds,
      selectionMode: snapshot.selectionMode,
      avoidRecentRepeats: snapshot.avoidRecentRepeats,
    },
    notifications: {
      emailOptIn: snapshot.emailOptIn,
    },
  };
}

export async function registerV1SettingsRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();
  const settings = createUserSettingsService(prisma, {
    DEFAULT_DISPLAY_SHOW_PUBLISHER: process.env.DEFAULT_DISPLAY_SHOW_PUBLISHER,
    DEFAULT_DISPLAY_SHOW_PLAYTIME: process.env.DEFAULT_DISPLAY_SHOW_PLAYTIME,
    DEFAULT_DISPLAY_GAMES_PER_FRAME: process.env.DEFAULT_DISPLAY_GAMES_PER_FRAME,
    DEFAULT_DISPLAY_ROTATION_INTERVAL_SECONDS:
      process.env.DEFAULT_DISPLAY_ROTATION_INTERVAL_SECONDS,
    DEFAULT_DISPLAY_SELECTION_MODE: process.env.DEFAULT_DISPLAY_SELECTION_MODE,
    DEFAULT_DISPLAY_AVOID_RECENT_REPEATS: process.env.DEFAULT_DISPLAY_AVOID_RECENT_REPEATS,
    DEFAULT_NOTIFICATIONS_EMAIL_OPT_IN: process.env.DEFAULT_NOTIFICATIONS_EMAIL_OPT_IN,
  });

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/settings', async (request, reply) => {
        const snapshot = await settings.getSettings(request.userId!);
        return reply.send(toResponse(snapshot));
      });

      protectedApp.patch('/settings', async (request, reply) => {
        const parsed = updateUserSettingsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: { code: 'INVALID_REQUEST', message: 'Invalid settings payload.' },
          });
        }

        const snapshot = await settings.updateSettings(request.userId!, parsed.data);
        return reply.send(toResponse(snapshot));
      });
    },
    { prefix: '/api/v1' },
  );
}
