import type { FastifyInstance } from 'fastify';
import type { DeviceService } from '../../../services/device-service.js';
import type { FrameStorage } from '../../../storage/index.js';

export function registerDeviceFrameDownloadRoutes(
  app: FastifyInstance,
  deviceService: DeviceService,
  storage: FrameStorage,
) {
  app.get('/api/device/v1/frames/:frameId.rgb565', async (request, reply) => {
    if (!request.deviceId) return;
    const { frameId } = request.params as { frameId: string };
    const owned = await deviceService.verifyFrameOwnership(frameId, request.deviceId);
    if (!owned) {
      return reply.status(404).send({
        error: { code: 'FRAME_NOT_FOUND', message: `Frame not found: ${frameId}` },
      });
    }
    try {
      const buffer = await storage.readFrameFile(frameId, 'rgb565');
      return reply.type('application/octet-stream').send(buffer);
    } catch {
      return reply.status(404).send({
        error: { code: 'FRAME_NOT_FOUND', message: `Frame not found: ${frameId}` },
      });
    }
  });

  app.get('/api/device/v1/frames/:frameId.png', async (request, reply) => {
    if (!request.deviceId) return;
    const { frameId } = request.params as { frameId: string };
    const owned = await deviceService.verifyFrameOwnership(frameId, request.deviceId);
    if (!owned) {
      return reply.status(404).send({
        error: { code: 'FRAME_NOT_FOUND', message: `Frame not found: ${frameId}` },
      });
    }
    try {
      const buffer = await storage.readFrameFile(frameId, 'png');
      return reply.type('image/png').send(buffer);
    } catch {
      return reply.status(404).send({
        error: { code: 'FRAME_NOT_FOUND', message: `Frame not found: ${frameId}` },
      });
    }
  });
}
