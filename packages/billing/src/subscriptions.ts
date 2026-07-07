import type { Plan, PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import type { SubscriptionUpsertInput } from './types.js';

export async function upsertActiveSubscription(
  prisma: PrismaClient,
  input: SubscriptionUpsertInput,
): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      id: createId('sub'),
      userId: input.userId,
      planId: input.planId,
      provider: input.provider,
      status: 'active',
      billingCycle: input.billingCycle,
      providerSubscriptionId: input.providerSubscriptionId,
      providerProductId: input.providerProductId,
      currentPeriodStart: input.currentPeriodStart ?? new Date(),
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelledAt: null,
    },
    update: {
      planId: input.planId,
      provider: input.provider,
      status: 'active',
      billingCycle: input.billingCycle,
      providerSubscriptionId: input.providerSubscriptionId,
      providerProductId: input.providerProductId,
      currentPeriodStart: input.currentPeriodStart ?? new Date(),
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelledAt: null,
    },
  });
}

export async function logSubscriptionEvent(
  prisma: PrismaClient,
  input: {
    subscriptionId?: string | null;
    userId: string;
    provider: string;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  await prisma.subscriptionEvent.create({
    data: {
      id: createId('subEvent'),
      subscriptionId: input.subscriptionId ?? null,
      userId: input.userId,
      provider: input.provider,
      eventType: input.eventType,
      payload: input.payload as object,
    },
  });
}

export async function findPlanByProviderProduct(
  prisma: PrismaClient,
  provider: 'paypal' | 'apple' | 'google',
  productId: string,
): Promise<{ plan: Plan; billingCycle: 'monthly' | 'annual' } | null> {
  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    const match = matchPlanProduct(plan, provider, productId);
    if (match) {
      return match;
    }
  }
  return null;
}

function matchPlanProduct(
  plan: Plan,
  provider: 'paypal' | 'apple' | 'google',
  productId: string,
): { plan: Plan; billingCycle: 'monthly' | 'annual' } | null {
  if (provider === 'paypal') {
    if (plan.paypalPlanIdMonthly === productId) {
      return { plan, billingCycle: 'monthly' };
    }
    if (plan.paypalPlanIdAnnual === productId) {
      return { plan, billingCycle: 'annual' };
    }
  }
  if (provider === 'apple') {
    if (plan.appleProductIdMonthly === productId) {
      return { plan, billingCycle: 'monthly' };
    }
    if (plan.appleProductIdAnnual === productId) {
      return { plan, billingCycle: 'annual' };
    }
  }
  if (provider === 'google') {
    if (plan.googleProductIdMonthly === productId) {
      return { plan, billingCycle: 'monthly' };
    }
    if (plan.googleProductIdAnnual === productId) {
      return { plan, billingCycle: 'annual' };
    }
  }
  return null;
}

export function resolvePayPalPlanId(
  plan: Plan,
  billingCycle: 'monthly' | 'annual',
): string {
  return billingCycle === 'monthly' ? plan.paypalPlanIdMonthly : plan.paypalPlanIdAnnual;
}
