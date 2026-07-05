import { describe, expect, it, vi } from 'vitest';
import { verifyGooglePurchase } from './verify.js';

describe('google verify', () => {
  it('activates subscription for valid purchase token', async () => {
    const playClient = {
      purchases: {
        subscriptions: {
          get: vi.fn().mockResolvedValue({
            data: { paymentState: 1, expiryTimeMillis: String(Date.now() + 86400000) },
          }),
        },
      },
    };
    const upsert = vi.fn();
    const prisma = {
      plan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'plan_pro',
            googleProductIdMonthly: 'pro_monthly',
            googleProductIdAnnual: 'pro_annual',
            appleProductIdMonthly: '',
            appleProductIdAnnual: '',
            paypalPlanIdMonthly: '',
            paypalPlanIdAnnual: '',
          },
        ]),
      },
      subscription: { upsert },
      subscriptionEvent: { create: vi.fn() },
    };

    const result = await verifyGooglePurchase(prisma as never, {
      playClient: playClient as never,
      packageName: 'com.digitalshelf.app',
      productId: 'pro_monthly',
      purchaseToken: 'tok',
      userId: 'user_1',
    });

    expect(result.planId).toBe('plan_pro');
    expect(result.status).toBe('active');
  });
});
