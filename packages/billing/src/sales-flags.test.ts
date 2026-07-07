import { describe, expect, it, vi } from 'vitest';
import { createSalesFlagsService } from './sales-flags.js';

describe('sales flags', () => {
  it('assertNewSalesAllowed throws SALES_DISABLED when new sales off', async () => {
    const prisma = {
      platformSetting: {
        findMany: vi.fn().mockResolvedValue([
          { key: 'sales.new_enabled', value: 'false' },
          { key: 'sales.renewals_enabled', value: 'true' },
          { key: 'sales.stop_message', value: 'Sales paused' },
        ]),
      },
    };
    const svc = createSalesFlagsService(prisma as never);
    await expect(svc.assertNewSalesAllowed()).rejects.toMatchObject({ code: 'SALES_DISABLED' });
  });

  it('shouldExtendRenewal returns false when renewals disabled', async () => {
    const prisma = {
      platformSetting: {
        findMany: vi.fn().mockResolvedValue([
          { key: 'sales.new_enabled', value: 'true' },
          { key: 'sales.renewals_enabled', value: 'false' },
          { key: 'sales.stop_message', value: '' },
        ]),
      },
    };
    const svc = createSalesFlagsService(prisma as never);
    await expect(svc.shouldExtendRenewal()).resolves.toBe(false);
  });
});
