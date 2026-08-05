import { z } from 'zod';

export const authMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    activationState: z.enum(['account_created', 'pending_activation', 'active']),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    steamConnected: z.boolean(),
    hasPassword: z.boolean(),
    authProviders: z.array(z.enum(['google', 'apple'])),
  }),
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const onboardingStatusResponseSchema = z.object({
  hasActiveSubscription: z.boolean(),
  hasSyncedLibrary: z.boolean(),
  hasClaimedDevice: z.boolean(),
  nextStep: z.enum(['subscribe', 'sync', 'devices', 'dashboard']),
});

export type OnboardingStatusResponse = z.infer<typeof onboardingStatusResponseSchema>;
