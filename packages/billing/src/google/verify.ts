import type { PrismaClient } from '@prisma/client';
import { BillingError } from '../types.js';
import {
  findPlanByProviderProduct,
  logSubscriptionEvent,
  upsertActiveSubscription,
} from '../subscriptions.js';

export type GooglePlayClient = {
  purchases: {
    subscriptions: {
      get: (input: {
        packageName: string;
        subscriptionId: string;
        token: string;
      }) => Promise<{ data: { paymentState?: number; expiryTimeMillis?: string } }>;
    };
  };
};

export function mapGoogleProductToPlanId(productId: string): 'plan_basic' | 'plan_pro' | null {
  if (productId.startsWith('basic')) {
    return 'plan_basic';
  }
  if (productId.startsWith('pro')) {
    return 'plan_pro';
  }
  return null;
}

export async function verifyGooglePurchase(
  prisma: PrismaClient,
  input: {
    playClient: GooglePlayClient;
    packageName: string;
    productId: string;
    purchaseToken: string;
    userId: string;
  },
): Promise<{ planId: string; status: 'active'; billingCycle: 'monthly' | 'annual' }> {
  const response = await input.playClient.purchases.subscriptions.get({
    packageName: input.packageName,
    subscriptionId: input.productId,
    token: input.purchaseToken,
  });

  if (response.data.paymentState !== 1) {
    throw new BillingError('INVALID_RECEIPT', 'Google purchase is not active.');
  }

  const planMatch = await findPlanByProviderProduct(prisma, 'google', input.productId);
  if (!planMatch) {
    throw new BillingError('INVALID_RECEIPT', 'Unknown Google product ID.');
  }

  const currentPeriodEnd = response.data.expiryTimeMillis
    ? new Date(Number(response.data.expiryTimeMillis))
    : undefined;

  await upsertActiveSubscription(prisma, {
    userId: input.userId,
    planId: planMatch.plan.id,
    provider: 'google',
    billingCycle: planMatch.billingCycle,
    providerSubscriptionId: input.purchaseToken,
    providerProductId: input.productId,
    currentPeriodEnd,
  });

  await logSubscriptionEvent(prisma, {
    userId: input.userId,
    provider: 'google',
    eventType: 'PURCHASE_VERIFIED',
    payload: { productId: input.productId },
  });

  return {
    planId: planMatch.plan.id,
    status: 'active',
    billingCycle: planMatch.billingCycle,
  };
}

export type GoogleRtdnMessage = {
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
};

export async function handleGoogleWebhook(
  prisma: PrismaClient,
  salesFlags: { shouldExtendRenewal(): Promise<boolean> },
  message: GoogleRtdnMessage,
  playClient: GooglePlayClient,
  packageName: string,
): Promise<void> {
  const notification = message.subscriptionNotification;
  if (!notification?.purchaseToken || !notification.subscriptionId) {
    return;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { provider: 'google', providerSubscriptionId: notification.purchaseToken },
  });
  if (!subscription) {
    return;
  }

  await logSubscriptionEvent(prisma, {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    provider: 'google',
    eventType: `RTDN_${notification.notificationType ?? 'UNKNOWN'}`,
    payload: message,
  });

  if (notification.notificationType === 2) {
    const extend = await salesFlags.shouldExtendRenewal();
    if (!extend) {
      return;
    }
    const verified = await playClient.purchases.subscriptions.get({
      packageName,
      subscriptionId: notification.subscriptionId,
      token: notification.purchaseToken,
    });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodEnd: verified.data.expiryTimeMillis
          ? new Date(Number(verified.data.expiryTimeMillis))
          : subscription.currentPeriodEnd,
      },
    });
    return;
  }

  if (notification.notificationType === 3 || notification.notificationType === 12) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'expired' },
    });
  }
}
