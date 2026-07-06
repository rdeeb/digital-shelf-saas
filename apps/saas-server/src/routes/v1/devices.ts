import type { FastifyInstance, FastifyReply } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adminClaimRequestSchema,
  adminDevicePatchSchema,
} from '@digital-shelf-saas/device-protocol';
import { createEntitlementService } from '@digital-shelf-saas/billing';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { prisma } from '../../db/client.js';
import { registerAuthPlugin } from '../../middleware/auth.js';
import { registerEntitlementGuard } from '../../middleware/entitlement.js';
import { createDeviceService, DeviceServiceError } from '../../services/device-service.js';
import {
  createFrameService,
  DeviceConfigNotFoundError,
  NoEligibleGamesError,
  type GameArtService,
} from '../../services/frame-service.js';
import { createUserSettingsService } from '../../services/user-settings-service.js';
import { loadEnv } from '../../config/env.js';
import { createFrameStorage } from '../../storage/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

const passthroughGameArtService: GameArtService = {
  async ensureArt(game) {
    return {
      accentColor: game.accentColor ?? '#202020',
      spineTextColor: game.spineTextColor === 'black' ? 'black' : 'white',
      spineArtPath: game.spineArtPath,
    };
  },
};

function createSaasFrameService() {
  const env = loadEnv();
  return createFrameService(prisma, {
    storage: createFrameStorage(env, { rootDir }),
    artRootPath: '',
    resolveSpineStyle: async () => 'gradient',
    resolveShowTitle: async () => true,
    gameArtService: passthroughGameArtService,
  });
}

function frameErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof NoEligibleGamesError) {
    return reply.status(422).send({
      error: { code: error.code, message: error.message },
    });
  }
  if (error instanceof DeviceConfigNotFoundError) {
    return reply.status(404).send({
      error: { code: error.code, message: error.message },
    });
  }
  throw error;
}

export async function registerV1DeviceRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();
  const entitlement = createEntitlementService(prisma);
  const userSettings = createUserSettingsService(prisma, {});
  const deviceService = createDeviceService(prisma, {
    pairingEnabled: true,
    entitlement,
    userSettings,
  });
  const frameService = createSaasFrameService();

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);
      await registerEntitlementGuard(protectedApp, entitlement);

      protectedApp.post('/devices/claim', async (request, reply) => {
        const parsed = adminClaimRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((i) => i.message).join('; '),
            },
          });
        }
        try {
          return await deviceService.claimByCode(request.userId!, parsed.data);
        } catch (error) {
          if (error instanceof DeviceServiceError) {
            return reply.status(error.statusCode).send({
              error: { code: error.code, message: error.message },
            });
          }
          throw error;
        }
      });

      protectedApp.get('/devices/:deviceId/frame', async (request, reply) => {
        const { deviceId } = request.params as { deviceId: string };
        const force = (request.query as { force?: string }).force === 'true';
        try {
          return await frameService.getLatestFrame(deviceId, {
            force,
            userId: request.userId!,
          });
        } catch (error) {
          return frameErrorReply(reply, error);
        }
      });
    },
    { prefix: '/api/v1' },
  );

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/devices', async (request, reply) => {
        const devices = await deviceService.listDevices(request.userId!);
        return reply.send({ devices });
      });

      protectedApp.get('/devices/:deviceId', async (request, reply) => {
        const { deviceId } = request.params as { deviceId: string };
        try {
          return await deviceService.getDevice(request.userId!, deviceId);
        } catch (error) {
          if (error instanceof DeviceServiceError) {
            return reply.status(error.statusCode).send({
              error: { code: error.code, message: error.message },
            });
          }
          throw error;
        }
      });

      protectedApp.patch('/devices/:deviceId/config', async (request, reply) => {
        const { deviceId } = request.params as { deviceId: string };
        const parsed = adminDevicePatchSchema.safeParse({ config: request.body });
        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((i) => i.message).join('; '),
            },
          });
        }
        try {
          return await deviceService.updateDevice(request.userId!, deviceId, parsed.data);
        } catch (error) {
          if (error instanceof DeviceServiceError) {
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
}

export async function registerDeviceV1Routes(app: FastifyInstance): Promise<void> {
  const deviceService = createDeviceService(prisma, { pairingEnabled: true });
  const frameService = createSaasFrameService();
  const frameStorage = createFrameStorage(loadEnv(), { rootDir });
  const deviceAuth = (await import('../../lib/device-auth.js')).createDeviceAuthHook(prisma);

  const { registerDeviceRegisterRoute } = await import('../device/v1/register.js');
  const { registerDeviceClaimStatusRoute } = await import('../device/v1/claim-status.js');
  const { registerDeviceConfigRoute } = await import('../device/v1/config.js');
  const { registerDeviceHeartbeatRoute } = await import('../device/v1/heartbeat.js');
  const { registerDeviceFrameManifestRoute } = await import('../device/v1/frame-manifest.js');
  const { registerDeviceFrameDownloadRoutes } = await import('../device/v1/frames.js');

  registerDeviceRegisterRoute(app, deviceService);
  registerDeviceClaimStatusRoute(app, deviceService);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', deviceAuth);
    registerDeviceConfigRoute(protectedApp, deviceService);
    registerDeviceHeartbeatRoute(protectedApp, deviceService);
    registerDeviceFrameManifestRoute(protectedApp, frameService);
    registerDeviceFrameDownloadRoutes(protectedApp, deviceService, frameStorage);
  });
}
