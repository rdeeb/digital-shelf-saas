import type { FastifyInstance } from 'fastify';
import { EntitlementError, type EntitlementService } from '@digital-shelf-saas/billing';
import type { FrameService } from '../../../services/frame-service.js';
import {
  DeviceConfigNotFoundError,
  NoEligibleGamesError,
} from '../../../services/frame-service.js';

export function registerDeviceFrameManifestRoute(
  app: FastifyInstance,
  frameService: FrameService,
  entitlement: EntitlementService,
) {
  app.get('/api/device/v1/frame-manifest', async (request, reply) => {
    if (!request.deviceId) return;
    try {
      await entitlement.requireActiveSubscription(request.userId!);
      const frame = await frameService.getLatestFrame(request.deviceId);
      return {
        frameId: frame.frameId,
        mode: 'bitmap' as const,
        format: 'rgb565' as const,
        width: frame.width,
        height: frame.height,
        downloadUrl: `/api/device/v1/frames/${frame.frameId}.rgb565`,
        ttlSeconds: frame.ttlSeconds,
        refreshAfterSeconds: frame.ttlSeconds,
      };
    } catch (error) {
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
      if (error instanceof EntitlementError) {
        return reply.status(403).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });
}
