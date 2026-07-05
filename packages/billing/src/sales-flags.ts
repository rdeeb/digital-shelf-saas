import type { PrismaClient } from '@prisma/client';
import { PLATFORM_SETTING_KEYS } from '@digital-shelf-saas/shared-types';
import { BillingError, type SalesFlags } from './types.js';

const DEFAULTS: SalesFlags = {
  newEnabled: true,
  renewalsEnabled: true,
  stopMessage: '',
};

type SalesFlagsEnv = {
  SALES_NEW_ENABLED?: string;
  SALES_RENEWALS_ENABLED?: string;
  SALES_STOP_MESSAGE?: string;
};

export function createSalesFlagsService(prisma: PrismaClient, env: SalesFlagsEnv = {}) {
  async function loadFlags(): Promise<SalesFlags> {
    const rows = await prisma.platformSetting.findMany({
      where: {
        key: {
          in: [
            PLATFORM_SETTING_KEYS.SALES_NEW_ENABLED,
            PLATFORM_SETTING_KEYS.SALES_RENEWALS_ENABLED,
            PLATFORM_SETTING_KEYS.SALES_STOP_MESSAGE,
          ],
        },
      },
    });
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
      newEnabled: parseBool(
        map.get(PLATFORM_SETTING_KEYS.SALES_NEW_ENABLED),
        env.SALES_NEW_ENABLED,
        DEFAULTS.newEnabled,
      ),
      renewalsEnabled: parseBool(
        map.get(PLATFORM_SETTING_KEYS.SALES_RENEWALS_ENABLED),
        env.SALES_RENEWALS_ENABLED,
        DEFAULTS.renewalsEnabled,
      ),
      stopMessage:
        map.get(PLATFORM_SETTING_KEYS.SALES_STOP_MESSAGE) ??
        env.SALES_STOP_MESSAGE ??
        DEFAULTS.stopMessage,
    };
  }

  return {
    loadFlags,

    async assertNewSalesAllowed(): Promise<void> {
      const flags = await loadFlags();
      if (!flags.newEnabled) {
        throw new BillingError(
          'SALES_DISABLED',
          flags.stopMessage || 'New subscriptions are currently unavailable.',
        );
      }
    },

    async shouldExtendRenewal(): Promise<boolean> {
      const flags = await loadFlags();
      return flags.renewalsEnabled;
    },
  };
}

function parseBool(dbValue: string | undefined, envValue: string | undefined, fallback: boolean): boolean {
  const raw = dbValue ?? envValue;
  if (raw === undefined) {
    return fallback;
  }
  return raw === 'true';
}

export type SalesFlagsService = ReturnType<typeof createSalesFlagsService>;
