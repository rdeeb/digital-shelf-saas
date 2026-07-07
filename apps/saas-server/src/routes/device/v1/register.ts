import type { FastifyInstance } from 'fastify';
import { registerRequestSchema } from '@digital-shelf-saas/device-protocol';
import type { DeviceService } from '../../../services/device-service.js';
import { DeviceServiceError } from '../../../services/device-service.js';

export function registerDeviceRegisterRoute(app: FastifyInstance, deviceService: DeviceService) {
  app.post('/api/device/v1/register', async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    }
    try {
      return await deviceService.register(parsed.data);
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
