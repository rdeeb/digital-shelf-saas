import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({
        status: 'ok',
        mode: 'cloud',
        version: '0.0.0',
        database: 'connected',
      });
    } catch {
      return reply.status(503).send({
        status: 'error',
        mode: 'cloud',
        version: '0.0.0',
        database: 'disconnected',
      });
    }
  });
}
