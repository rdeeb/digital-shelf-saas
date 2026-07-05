import { z } from 'zod';

export const registerRequestSchema = z.object({
  hardwareId: z.string().min(1).max(64),
  deviceId: z.string().min(1).optional(),
  firmwareVersion: z.string().optional(),
  screenWidth: z.number().int().positive().optional(),
  screenHeight: z.number().int().positive().optional(),
  deviceName: z.string().min(1).max(64).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const registerResponseSchema = z.object({
  deviceId: z.string(),
  claimCode: z.string().optional(),
  status: z.enum(['pending', 'claimed']),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;
