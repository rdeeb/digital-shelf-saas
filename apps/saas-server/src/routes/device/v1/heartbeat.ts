import type { FastifyInstance } from 'fastify';
import { heartbeatRequestSchema } from '@digital-shelf-saas/device-protocol';
import type { DeviceService } from '../../../services/device-service.js';
import { DeviceServiceError } from '../../../services/device-service.js';

export function registerDeviceHeartbeatRoute(app: FastifyInstance, deviceService: DeviceService) {
  app.post('/api/device/v1/heartbeat', async (request, reply) => {
    if (!request.deviceId) return;
    const parsed = heartbeatRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    }
    try {
      await deviceService.recordHeartbeat(request.deviceId, parsed.data);
      return { ok: true as const };
    } catch (error) {
      if (error instanceof DeviceServiceError) {
        return reply.status(error.statusCode).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });
}
