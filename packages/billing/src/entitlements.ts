import type { PrismaClient } from '@prisma/client';
import { BillingError } from './types.js';

export class EntitlementError extends BillingError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'EntitlementError';
  }
}

export function createEntitlementService(prisma: PrismaClient) {
  return {
    async requireActiveSubscription(userId: string): Promise<void> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      if (!subscription || subscription.status !== 'active') {
        throw new EntitlementError(
          'SUBSCRIPTION_REQUIRED',
          'An active subscription is required.',
        );
      }
    },

    async hasActiveSubscription(userId: string): Promise<boolean> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      return subscription?.status === 'active';
    },

    async getDeviceLimit(userId: string): Promise<number | null> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      if (!subscription || subscription.status !== 'active') {
        return null;
      }
      const plan = await prisma.plan.findUnique({ where: { id: subscription.planId } });
      return plan?.deviceLimit ?? null;
    },

    async canClaimDevice(userId: string): Promise<boolean> {
      const subscription = await prisma.subscription.findUnique({ where: { userId } });
      if (!subscription || subscription.status !== 'active') {
        return false;
      }
      const plan = await prisma.plan.findUnique({ where: { id: subscription.planId } });
      if (!plan || plan.deviceLimit == null) {
        return true;
      }
      const claimedCount = await prisma.device.count({
        where: { userId, tokenHash: { not: '' } },
      });
      return claimedCount < plan.deviceLimit;
    },
  };
}

export type EntitlementService = ReturnType<typeof createEntitlementService>;
