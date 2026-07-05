import { describe, expect, it, vi } from 'vitest';
import { createEntitlementService } from './entitlements.js';

describe('entitlements', () => {
  it('requireActiveSubscription throws SUBSCRIPTION_REQUIRED when inactive', async () => {
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue({ status: 'expired', planId: 'plan_basic' }),
      },
      plan: { findUnique: vi.fn() },
      device: { count: vi.fn() },
    };
    const svc = createEntitlementService(prisma as never);
    await expect(svc.requireActiveSubscription('user_1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('getDeviceLimit returns 1 for basic plan', async () => {
    const prisma = {
      subscription: {
        findUnique: vi.fn().mockResolvedValue({ status: 'active', planId: 'plan_basic' }),
      },
      plan: { findUnique: vi.fn().mockResolvedValue({ deviceLimit: 1 }) },
      device: { count: vi.fn() },
    };
    const svc = createEntitlementService(prisma as never);
    await expect(svc.getDeviceLimit('user_1')).resolves.toBe(1);
  });
});
