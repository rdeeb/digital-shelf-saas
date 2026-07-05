import { z } from 'zod';

export const heartbeatRequestSchema = z.object({
  firmwareVersion: z.string().optional(),
  wifiRssi: z.number().int().optional(),
  freeHeap: z.number().int().optional(),
  currentFrameId: z.string().optional(),
});

export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;

export const heartbeatResponseSchema = z.object({
  ok: z.literal(true),
});

export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
