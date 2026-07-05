import type { PrismaClient } from '@prisma/client';
import {
  findPlanByProviderProduct,
  logSubscriptionEvent,
  upsertActiveSubscription,
} from '../subscriptions.js';
import { mapPayPalWebhookEvent, type PayPalWebhookEvent } from './client.js';
import type { SalesFlagsService } from '../sales-flags.js';

export async function handlePayPalWebhook(
  prisma: PrismaClient,
  salesFlags: SalesFlagsService,
  event: PayPalWebhookEvent,
): Promise<void> {
  const mapped = mapPayPalWebhookEvent(event);
  if (!mapped.handled) {
    return;
  }

  const planMatch = await findPlanByProviderProduct(prisma, 'paypal', mapped.providerProductId);
  const existing = await prisma.subscription.findUnique({ where: { userId: mapped.userId } });

  await logSubscriptionEvent(prisma, {
    subscriptionId: existing?.id ?? null,
    userId: mapped.userId,
    provider: 'paypal',
    eventType: mapped.eventType,
    payload: event,
  });

  if (mapped.activate && planMatch) {
    await upsertActiveSubscription(prisma, {
      userId: mapped.userId,
      planId: planMatch.plan.id,
      provider: 'paypal',
      billingCycle: planMatch.billingCycle,
      providerSubscriptionId: mapped.providerSubscriptionId,
      providerProductId: mapped.providerProductId,
      currentPeriodEnd: mapped.renewUntil,
    });
    return;
  }

  if (mapped.renewUntil) {
    const extend = await salesFlags.shouldExtendRenewal();
    if (!extend) {
      return;
    }
    await prisma.subscription.updateMany({
      where: { userId: mapped.userId, providerSubscriptionId: mapped.providerSubscriptionId },
      data: { currentPeriodEnd: mapped.renewUntil, status: 'active' },
    });
    return;
  }

  if (mapped.cancel) {
    await prisma.subscription.updateMany({
      where: { userId: mapped.userId, providerSubscriptionId: mapped.providerSubscriptionId },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    return;
  }

  if (mapped.expire) {
    await prisma.subscription.updateMany({
      where: { userId: mapped.userId, providerSubscriptionId: mapped.providerSubscriptionId },
      data: { status: 'expired' },
    });
  }
}
