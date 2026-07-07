import { describe, expect, it, vi } from 'vitest';
import { handlePayPalWebhook } from './webhook-handler.js';

describe('PayPal webhook handler', () => {
  it('activates subscription on SUBSCRIPTION.ACTIVATED', async () => {
    const upsert = vi.fn();
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
        updateMany: vi.fn(),
      },
      plan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'plan_basic',
            paypalPlanIdMonthly: 'paypal_basic_monthly',
            paypalPlanIdAnnual: 'paypal_basic_annual',
            appleProductIdMonthly: '',
            appleProductIdAnnual: '',
            googleProductIdMonthly: '',
            googleProductIdAnnual: '',
          },
        ]),
      },
      subscriptionEvent: { create: vi.fn() },
    };
    const salesFlags = { shouldExtendRenewal: vi.fn().mockResolvedValue(true) };

    await handlePayPalWebhook(prisma as never, salesFlags as never, {
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: {
        id: 'I-SUB123',
        custom_id: 'user_test1',
        plan_id: 'paypal_basic_monthly',
        billing_info: { next_billing_time: '2026-08-05T00:00:00Z' },
      },
    });

    expect(upsert).toHaveBeenCalled();
  });

  it('skips renewal extension when renewals disabled', async () => {
    const updateMany = vi.fn();
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sub_1', userId: 'user_test1' }),
        updateMany,
      },
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      subscriptionEvent: { create: vi.fn() },
    };
    const salesFlags = { shouldExtendRenewal: vi.fn().mockResolvedValue(false) };

    await handlePayPalWebhook(prisma as never, salesFlags as never, {
      event_type: 'BILLING.SUBSCRIPTION.RENEWED',
      resource: {
        id: 'I-SUB123',
        custom_id: 'user_test1',
        plan_id: 'paypal_basic_monthly',
        billing_info: { next_billing_time: '2026-09-05T00:00:00Z' },
      },
    });

    expect(updateMany).not.toHaveBeenCalled();
  });
});
