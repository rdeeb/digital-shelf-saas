import { z } from 'zod';

export const claimStatusQuerySchema = z.object({
  deviceId: z.string().min(1),
  hardwareId: z.string().min(1).max(64),
});

export type ClaimStatusQuery = z.infer<typeof claimStatusQuerySchema>;

export const claimStatusResponseSchema = z.object({
  status: z.enum(['pending', 'claimed']),
  claimCode: z.string().optional(),
  token: z.string().optional(),
});

export type ClaimStatusResponse = z.infer<typeof claimStatusResponseSchema>;
