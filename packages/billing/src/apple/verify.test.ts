import { describe, expect, it, vi } from 'vitest';
import { decodeAppleTransactionJws, verifyApplePurchase } from './verify.js';

describe('apple verify', () => {
  it('decodes transaction JWS payload', () => {
    const payload = Buffer.from(
      JSON.stringify({
        productId: 'com.digitalshelf.pro.monthly',
        originalTransactionId: 'apple_tx_1',
        expiresDate: Date.now() + 86400000,
      }),
    ).toString('base64url');
    const jws = `header.${payload}.sig`;
    expect(decodeAppleTransactionJws(jws).productId).toBe('com.digitalshelf.pro.monthly');
  });

  it('activates subscription for valid receipt', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        productId: 'pro_monthly',
        originalTransactionId: 'apple_tx_2',
        expiresDate: Date.now() + 86400000,
      }),
    ).toString('base64url');
    const jws = `header.${payload}.sig`;

    const upsert = vi.fn();
    const prisma = {
      plan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'plan_pro',
            googleProductIdMonthly: 'pro_monthly',
            googleProductIdAnnual: 'pro_annual',
            appleProductIdMonthly: 'pro_monthly',
            appleProductIdAnnual: 'pro_annual',
            paypalPlanIdMonthly: '',
            paypalPlanIdAnnual: '',
          },
        ]),
      },
      subscription: { upsert },
      subscriptionEvent: { create: vi.fn() },
    };

    const result = await verifyApplePurchase(prisma as never, {
      transactionJws: jws,
      userId: 'user_1',
    });

    expect(result.planId).toBe('plan_pro');
    expect(result.status).toBe('active');
    expect(upsert).toHaveBeenCalled();
  });
});
