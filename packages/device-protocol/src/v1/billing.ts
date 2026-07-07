import { z } from 'zod';

export const billingPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceLimit: z.number().nullable(),
});

export const billingPlansResponseSchema = z.object({
  plans: z.array(billingPlanSchema),
  salesFlags: z.object({
    newEnabled: z.boolean(),
    renewalsEnabled: z.boolean(),
    stopMessage: z.string(),
  }),
});

export const billingStatusResponseSchema = z.object({
  subscription: z
    .object({
      planId: z.string(),
      status: z.string(),
      provider: z.string(),
      billingCycle: z.string(),
      currentPeriodEnd: z.string().nullable(),
    })
    .nullable(),
  deviceLimit: z.number().nullable(),
  canClaimDevice: z.boolean(),
});

export const paypalSubscribeRequestSchema = z.object({
  planId: z.enum(['plan_basic', 'plan_pro']),
  billingCycle: z.enum(['monthly', 'annual']),
});

export const appleVerifyRequestSchema = z.object({
  transactionJws: z.string().min(1),
});

export const googleVerifyRequestSchema = z.object({
  productId: z.string().min(1),
  purchaseToken: z.string().min(1),
});
