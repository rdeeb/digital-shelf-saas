import type { Plan } from '@prisma/client';
import { BillingError } from '../types.js';
import { resolvePayPalPlanId } from '../subscriptions.js';

export type PayPalClientConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type CreatePayPalSubscriptionInput = {
  plan: Plan;
  billingCycle: 'monthly' | 'annual';
  returnUrl: string;
  cancelUrl: string;
  customId: string;
};

export type PayPalSubscriptionResult = {
  approvalUrl: string;
  subscriptionId: string;
};

export function createPayPalClient(config: PayPalClientConfig) {
  const baseUrl = config.baseUrl ?? 'https://api-m.sandbox.paypal.com';
  const fetchImpl = config.fetchImpl ?? fetch;

  async function getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) {
      throw new BillingError('PAYPAL_AUTH_FAILED', 'Failed to authenticate with PayPal.');
    }
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  return {
    async createSubscription(input: CreatePayPalSubscriptionInput): Promise<PayPalSubscriptionResult> {
      const token = await getAccessToken();
      const paypalPlanId = resolvePayPalPlanId(input.plan, input.billingCycle);
      const response = await fetchImpl(`${baseUrl}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: paypalPlanId,
          custom_id: input.customId,
          application_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        }),
      });
      if (!response.ok) {
        throw new BillingError('PAYPAL_SUBSCRIBE_FAILED', 'Failed to create PayPal subscription.');
      }
      const body = (await response.json()) as {
        id: string;
        links?: Array<{ rel: string; href: string }>;
      };
      const approveLink = body.links?.find((link) => link.rel === 'approve');
      if (!approveLink?.href) {
        throw new BillingError('PAYPAL_SUBSCRIBE_FAILED', 'PayPal approval URL missing.');
      }
      return { approvalUrl: approveLink.href, subscriptionId: body.id };
    },
  };
}

export type PayPalWebhookEvent = {
  event_type: string;
  resource: {
    id?: string;
    custom_id?: string;
    plan_id?: string;
    billing_info?: {
      next_billing_time?: string;
      last_payment?: { time?: string };
    };
    status?: string;
  };
};

export type PayPalWebhookResult =
  | { handled: false }
  | {
      handled: true;
      userId: string;
      providerSubscriptionId: string;
      providerProductId: string;
      eventType: string;
      activate?: boolean;
      renewUntil?: Date;
      cancel?: boolean;
      expire?: boolean;
    };

export function mapPayPalWebhookEvent(event: PayPalWebhookEvent): PayPalWebhookResult {
  const userId = event.resource.custom_id;
  const providerSubscriptionId = event.resource.id;
  const providerProductId = event.resource.plan_id ?? '';
  if (!userId || !providerSubscriptionId) {
    return { handled: false };
  }

  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      return {
        handled: true,
        userId,
        providerSubscriptionId,
        providerProductId,
        eventType: event.event_type,
        activate: true,
        renewUntil: parseDate(event.resource.billing_info?.next_billing_time),
      };
    case 'BILLING.SUBSCRIPTION.RENEWED':
      return {
        handled: true,
        userId,
        providerSubscriptionId,
        providerProductId,
        eventType: event.event_type,
        renewUntil: parseDate(event.resource.billing_info?.next_billing_time),
      };
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      return {
        handled: true,
        userId,
        providerSubscriptionId,
        providerProductId,
        eventType: event.event_type,
        cancel: true,
      };
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      return {
        handled: true,
        userId,
        providerSubscriptionId,
        providerProductId,
        eventType: event.event_type,
        expire: true,
      };
    default:
      return { handled: false };
  }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
