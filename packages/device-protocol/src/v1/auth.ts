import { z } from 'zod';

export const authMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    steamId64: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
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
