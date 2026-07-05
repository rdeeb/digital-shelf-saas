import type { FastifyInstance } from 'fastify';
import type { DeviceService } from '../../../services/device-service.js';
import { DeviceServiceError } from '../../../services/device-service.js';

export function registerDeviceConfigRoute(app: FastifyInstance, deviceService: DeviceService) {
  app.get('/api/device/v1/config', async (request, reply) => {
    if (!request.deviceId) return;
    try {
      return await deviceService.getConfig(request.deviceId);
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
