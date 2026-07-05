import Fastify, { type FastifyServerOptions } from 'fastify';
import { registerHealthRoutes } from './routes/health.js';

export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  await registerHealthRoutes(app);

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${request.method} ${request.url}`,
        },
      });
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  return app;
}
