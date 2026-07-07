import type { FastifyInstance } from 'fastify';
import { claimStatusQuerySchema } from '@digital-shelf-saas/device-protocol';
import type { DeviceService } from '../../../services/device-service.js';
import { DeviceServiceError } from '../../../services/device-service.js';

export function registerDeviceClaimStatusRoute(app: FastifyInstance, deviceService: DeviceService) {
  app.get('/api/device/v1/claim-status', async (request, reply) => {
    const parsed = claimStatusQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    }
    try {
      return await deviceService.getClaimStatus(parsed.data);
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
