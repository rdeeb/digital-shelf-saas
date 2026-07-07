import type { FastifyInstance } from 'fastify';
import {
  createSalesFlagsService,
  handleAppleWebhook,
  handleGoogleWebhook,
  handlePayPalWebhook,
  type PayPalWebhookEvent,
} from '@digital-shelf-saas/billing';
import { prisma } from '../../db/client.js';
import { loadEnv } from '../../config/env.js';

export async function registerBillingWebhookRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const salesFlags = createSalesFlagsService(prisma, {
    SALES_NEW_ENABLED: process.env.SALES_NEW_ENABLED,
    SALES_RENEWALS_ENABLED: process.env.SALES_RENEWALS_ENABLED,
    SALES_STOP_MESSAGE: process.env.SALES_STOP_MESSAGE,
  });

  app.post('/api/billing/paypal/webhook', async (request, reply) => {
    await handlePayPalWebhook(prisma, salesFlags, request.body as PayPalWebhookEvent);
    return reply.send({ ok: true });
  });

  app.post('/api/billing/apple/webhook', async (request, reply) => {
    await handleAppleWebhook(prisma, salesFlags, request.body as never);
    return reply.send({ ok: true });
  });

  app.post('/api/billing/google/webhook', async (request, reply) => {
    const message =
      typeof request.body === 'object' && request.body && 'message' in request.body
        ? JSON.parse(
            Buffer.from(String((request.body as { message: { data?: string } }).message.data ?? ''), 'base64').toString(
              'utf8',
            ),
          )
        : request.body;
    await handleGoogleWebhook(
      prisma,
      salesFlags,
      message as never,
      {
        purchases: {
          subscriptions: {
            get: async () => ({
              data: { paymentState: 1, expiryTimeMillis: String(Date.now() + 86400000) },
            }),
          },
        },
      },
      env.GOOGLE_PLAY_PACKAGE_NAME || 'com.digitalshelf.app',
    );
    return reply.send({ ok: true });
  });
}
