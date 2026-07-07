import { z } from 'zod';
import type { SelectionMode } from './enums.js';

export const billingProviderSchema = z.enum(['paypal', 'apple', 'google']);
export type BillingProvider = z.infer<typeof billingProviderSchema>;

export const billingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const subscriptionStatusSchema = z.enum([
  'pending',
  'active',
  'cancelled',
  'expired',
  'past_due',
  'grace_period',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export type User = {
  id: string;
  steamId64: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Plan = {
  id: string;
  name: string;
  deviceLimit: number | null;
};

export type Subscription = {
  id: string;
  userId: string;
  planId: string;
  provider: BillingProvider;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  providerSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
};

export const DEFAULT_USER_DISPLAY_SETTINGS = {
  gamesPerFrame: 3 as const,
  rotationIntervalSeconds: 300,
  selectionMode: 'random' as SelectionMode,
  showPublisher: true,
  showPlaytime: false,
  avoidRecentRepeats: true,
};
