import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { registerAccountAuthRoutes } from './routes/auth/account.js';
import { registerSteamAuthRoutes } from './routes/auth/steam.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerV1AuthRoutes, registerV1OnboardingRoutes } from './routes/v1/index.js';
import { registerV1BillingRoutes } from './routes/v1/billing.js';
import { registerV1SettingsRoutes } from './routes/v1/settings.js';
import { registerV1LibraryRoutes } from './routes/v1/library.js';
import { registerV1DeviceRoutes, registerDeviceV1Routes } from './routes/v1/devices.js';
import { registerBillingWebhookRoutes } from './routes/billing/webhooks.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export async function buildApp(options: FastifyServerOptions = {}) {
  const env = loadEnv();
  const app = Fastify(options);

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  await registerHealthRoutes(app);
  await registerAccountAuthRoutes(app);
  await registerSteamAuthRoutes(app);
  await registerV1AuthRoutes(app);
  await registerV1OnboardingRoutes(app);
  await registerV1BillingRoutes(app);
  await registerV1SettingsRoutes(app);
  await registerV1LibraryRoutes(app);
  await registerV1DeviceRoutes(app);
  await registerDeviceV1Routes(app);
  await registerBillingWebhookRoutes(app);
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
    decorateReply: true,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${request.method} ${request.url}`,
        },
      });
    }
    return reply.type('text/html').sendFile('index.html');
  });

  return app;
}
