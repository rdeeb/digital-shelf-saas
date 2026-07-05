import { z } from 'zod';
import { gamesPerFrameSchema, selectionModeSchema } from '@digital-shelf-saas/shared-types';

export const adminClaimRequestSchema = z.object({
  claimCode: z.string().regex(/^\d{6}$/),
  name: z.string().min(1).max(64).optional(),
});

export type AdminClaimRequest = z.infer<typeof adminClaimRequestSchema>;

export const adminClaimResponseSchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  status: z.literal('claimed'),
  tokenPendingDelivery: z.boolean(),
});

export type AdminClaimResponse = z.infer<typeof adminClaimResponseSchema>;

export const adminDeviceConfigPatchSchema = z.object({
  gamesPerFrame: gamesPerFrameSchema.optional(),
  rotationIntervalSeconds: z.number().int().positive().optional(),
  selectionMode: selectionModeSchema.optional(),
  showPublisher: z.boolean().optional(),
  showPlaytime: z.boolean().optional(),
  avoidRecentRepeats: z.boolean().optional(),
});

export const adminDevicePatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  config: adminDeviceConfigPatchSchema.optional(),
});

export type AdminDevicePatch = z.infer<typeof adminDevicePatchSchema>;

export const adminDeviceListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  hardwareId: z.string(),
  status: z.enum(['pending', 'claimed']),
  isPreview: z.boolean(),
  screenWidth: z.number().int(),
  screenHeight: z.number().int(),
  firmwareVersion: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  lastWifiRssi: z.number().nullable(),
  lastFrameId: z.string().nullable(),
  createdAt: z.string(),
});

export type AdminDeviceListItem = z.infer<typeof adminDeviceListItemSchema>;
