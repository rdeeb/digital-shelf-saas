import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BillingError,
  createEntitlementService,
  createPayPalClient,
  createSalesFlagsService,
  verifyApplePurchase,
  verifyGooglePurchase,
} from '@digital-shelf-saas/billing';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { loadEnv } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { registerAuthPlugin } from '../../middleware/auth.js';

export async function registerV1BillingRoutes(app: FastifyInstance): Promise<void> {
  const auth = createAuthServiceFromEnv();
  const env = loadEnv();
  const salesFlags = createSalesFlagsService(prisma, {
    SALES_NEW_ENABLED: process.env.SALES_NEW_ENABLED,
    SALES_RENEWALS_ENABLED: process.env.SALES_RENEWALS_ENABLED,
    SALES_STOP_MESSAGE: process.env.SALES_STOP_MESSAGE,
  });
  const entitlement = createEntitlementService(prisma);

  async function assertSteamLinked(userId: string): Promise<void> {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (!account) {
      throw new BillingError('STEAM_LINK_REQUIRED', 'Link your Steam account before subscribing.');
    }
  }

  await app.register(
    async (protectedApp) => {
      await registerAuthPlugin(protectedApp, auth);

      protectedApp.get('/billing/plans', async (_request, reply) => {
        const [plans, flags] = await Promise.all([
          prisma.plan.findMany({ orderBy: { id: 'asc' } }),
          salesFlags.loadFlags(),
        ]);
        return reply.send({
          plans: plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            deviceLimit: plan.deviceLimit,
          })),
          salesFlags: {
            newEnabled: flags.newEnabled,
            renewalsEnabled: flags.renewalsEnabled,
            stopMessage: flags.stopMessage,
          },
        });
      });

      protectedApp.get('/billing/status', async (request, reply) => {
        const [subscription, deviceLimit, canClaimDevice] = await Promise.all([
          prisma.subscription.findUnique({
            where: { userId: request.userId! },
          }),
          entitlement.getDeviceLimit(request.userId!),
          entitlement.canClaimDevice(request.userId!),
        ]);
        if (!subscription) {
          return reply.send({ subscription: null, deviceLimit, canClaimDevice });
        }
        return reply.send({
          subscription: {
            planId: subscription.planId,
            status: subscription.status,
            provider: subscription.provider,
            billingCycle: subscription.billingCycle,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          },
          deviceLimit,
          canClaimDevice,
        });
      });

      const subscribeSchema = z.object({
        planId: z.enum(['plan_basic', 'plan_pro']),
        billingCycle: z.enum(['monthly', 'annual']),
      });

      protectedApp.post('/billing/paypal/subscribe', async (request, reply) => {
        try {
          await assertSteamLinked(request.userId!);
          await salesFlags.assertNewSalesAllowed();
          const parsed = subscribeSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: { code: 'INVALID_REQUEST', message: 'Invalid subscribe payload.' },
            });
          }

          const plan = await prisma.plan.findUniqueOrThrow({ where: { id: parsed.data.planId } });
          const paypal = createPayPalClient({
            clientId: env.PAYPAL_CLIENT_ID,
            clientSecret: env.PAYPAL_CLIENT_SECRET,
          });
          const result = await paypal.createSubscription({
            plan,
            billingCycle: parsed.data.billingCycle,
            returnUrl: `${env.SERVER_PUBLIC_URL}/subscribe/success`,
            cancelUrl: `${env.SERVER_PUBLIC_URL}/subscribe/cancel`,
            customId: request.userId!,
          });

          return reply.send({ approvalUrl: result.approvalUrl });
        } catch (error) {
          if (error instanceof BillingError) {
            return reply.status(403).send({ error: { code: error.code, message: error.message } });
          }
          throw error;
        }
      });

      const appleSchema = z.object({ transactionJws: z.string().min(1) });

      protectedApp.post('/billing/apple/verify', async (request, reply) => {
        try {
          const existing = await prisma.subscription.findUnique({
            where: { userId: request.userId! },
          });
          if (!existing) {
            await salesFlags.assertNewSalesAllowed();
          }
          const parsed = appleSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: { code: 'INVALID_REQUEST', message: 'Invalid Apple verify payload.' },
            });
          }
          const result = await verifyApplePurchase(prisma, {
            transactionJws: parsed.data.transactionJws,
            userId: request.userId!,
          });
          return reply.send(result);
        } catch (error) {
          if (error instanceof BillingError) {
            return reply.status(400).send({ error: { code: error.code, message: error.message } });
          }
          throw error;
        }
      });

      const googleSchema = z.object({
        productId: z.string().min(1),
        purchaseToken: z.string().min(1),
      });

      protectedApp.post('/billing/google/verify', async (request, reply) => {
        try {
          const existing = await prisma.subscription.findUnique({
            where: { userId: request.userId! },
          });
          if (!existing) {
            await salesFlags.assertNewSalesAllowed();
          }
          const parsed = googleSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: { code: 'INVALID_REQUEST', message: 'Invalid Google verify payload.' },
            });
          }
          if (!env.GOOGLE_PLAY_PACKAGE_NAME) {
            return reply.status(503).send({
              error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google Play is not configured.' },
            });
          }
          const result = await verifyGooglePurchase(prisma, {
            playClient: createGooglePlayClientStub(),
            packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
            productId: parsed.data.productId,
            purchaseToken: parsed.data.purchaseToken,
            userId: request.userId!,
          });
          return reply.send(result);
        } catch (error) {
          if (error instanceof BillingError) {
            return reply.status(400).send({ error: { code: error.code, message: error.message } });
          }
          throw error;
        }
      });

      protectedApp.get('/billing/device-limit', async (request, reply) => {
        const limit = await entitlement.getDeviceLimit(request.userId!);
        const canClaim = await entitlement.canClaimDevice(request.userId!);
        return reply.send({ deviceLimit: limit, canClaimDevice: canClaim });
      });
    },
    { prefix: '/api/v1' },
  );
}

function createGooglePlayClientStub() {
  return {
    purchases: {
      subscriptions: {
        get: async () => ({
          data: { paymentState: 1, expiryTimeMillis: String(Date.now() + 86400000) },
        }),
      },
    },
  };
}
