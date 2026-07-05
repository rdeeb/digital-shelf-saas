import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import { loadEnv } from './config/env.js';
import { registerSteamAuthRoutes } from './routes/auth/steam.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerV1AuthRoutes, registerV1OnboardingRoutes } from './routes/v1/index.js';

export async function buildApp(options: FastifyServerOptions = {}) {
  const env = loadEnv();
  const app = Fastify(options);

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  await registerHealthRoutes(app);
  await registerSteamAuthRoutes(app);
  await registerV1AuthRoutes(app);
  await registerV1OnboardingRoutes(app);

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
