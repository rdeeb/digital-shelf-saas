import type { PrismaClient } from '@prisma/client';
import { BillingError } from '../types.js';
import {
  findPlanByProviderProduct,
  logSubscriptionEvent,
  upsertActiveSubscription,
} from '../subscriptions.js';

export type AppleTransactionPayload = {
  productId: string;
  originalTransactionId: string;
  expiresDate?: number;
};

export function decodeAppleTransactionJws(transactionJws: string): AppleTransactionPayload {
  const parts = transactionJws.split('.');
  if (parts.length < 2) {
    throw new BillingError('INVALID_RECEIPT', 'Invalid Apple transaction JWS.');
  }
  const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
    productId?: string;
    originalTransactionId?: string;
    expiresDate?: number;
  };
  if (!payload.productId || !payload.originalTransactionId) {
    throw new BillingError('INVALID_RECEIPT', 'Apple transaction payload missing required fields.');
  }
  return {
    productId: payload.productId,
    originalTransactionId: payload.originalTransactionId,
    expiresDate: payload.expiresDate,
  };
}

export async function verifyApplePurchase(
  prisma: PrismaClient,
  input: { transactionJws: string; userId: string },
): Promise<{ planId: string; status: 'active'; billingCycle: 'monthly' | 'annual' }> {
  const decoded = decodeAppleTransactionJws(input.transactionJws);
  const planMatch = await findPlanByProviderProduct(prisma, 'apple', decoded.productId);
  if (!planMatch) {
    throw new BillingError('INVALID_RECEIPT', 'Unknown Apple product ID.');
  }

  const currentPeriodEnd = decoded.expiresDate ? new Date(decoded.expiresDate) : undefined;

  await upsertActiveSubscription(prisma, {
    userId: input.userId,
    planId: planMatch.plan.id,
    provider: 'apple',
    billingCycle: planMatch.billingCycle,
    providerSubscriptionId: decoded.originalTransactionId,
    providerProductId: decoded.productId,
    currentPeriodEnd,
  });

  await logSubscriptionEvent(prisma, {
    userId: input.userId,
    provider: 'apple',
    eventType: 'PURCHASE_VERIFIED',
    payload: decoded,
  });

  return {
    planId: planMatch.plan.id,
    status: 'active',
    billingCycle: planMatch.billingCycle,
  };
}

export type AppleNotificationPayload = {
  notificationType: string;
  data?: {
    signedTransactionInfo?: string;
  };
};

export async function handleAppleWebhook(
  prisma: PrismaClient,
  salesFlags: { shouldExtendRenewal(): Promise<boolean> },
  payload: AppleNotificationPayload,
): Promise<void> {
  if (!payload.data?.signedTransactionInfo) {
    return;
  }
  const decoded = decodeAppleTransactionJws(payload.data.signedTransactionInfo);
  const subscription = await prisma.subscription.findFirst({
    where: { provider: 'apple', providerSubscriptionId: decoded.originalTransactionId },
  });
  if (!subscription) {
    return;
  }

  await logSubscriptionEvent(prisma, {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    provider: 'apple',
    eventType: payload.notificationType,
    payload,
  });

  if (payload.notificationType === 'DID_RENEW') {
    const extend = await salesFlags.shouldExtendRenewal();
    if (!extend) {
      return;
    }
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodEnd: decoded.expiresDate ? new Date(decoded.expiresDate) : subscription.currentPeriodEnd,
      },
    });
    return;
  }

  if (payload.notificationType === 'EXPIRED' || payload.notificationType === 'REVOKE') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'expired' },
    });
  }
}
