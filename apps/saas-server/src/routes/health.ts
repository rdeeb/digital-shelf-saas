import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      mode: 'cloud',
      version: '0.0.0',
    });
  });
}
