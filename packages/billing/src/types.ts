export class BillingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

export type SalesFlags = {
  newEnabled: boolean;
  renewalsEnabled: boolean;
  stopMessage: string;
};

export type SubscriptionUpsertInput = {
  userId: string;
  planId: string;
  provider: 'paypal' | 'apple' | 'google';
  billingCycle: 'monthly' | 'annual';
  providerSubscriptionId: string;
  providerProductId: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
};
