import { z } from 'zod';

export const adminSyncRunLogSchema = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  gamesDiscovered: z.number().int().nullable(),
  gamesAdded: z.number().int().nullable(),
  gamesUpdated: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const adminMetadataJobLogSchema = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  queued: z.number().int(),
  enriched: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
});

export const adminLogsResponseSchema = z.object({
  syncRuns: z.array(adminSyncRunLogSchema),
  metadataJob: adminMetadataJobLogSchema.nullable(),
});

export type AdminLogsResponse = z.infer<typeof adminLogsResponseSchema>;

export const adminRecentErrorSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  code: z.string(),
  message: z.string(),
  source: z.enum(['sync', 'metadata', 'frame', 'device']),
  context: z.record(z.string()).optional(),
});

export const adminRecentErrorsResponseSchema = z.object({
  errors: z.array(adminRecentErrorSchema),
});

export type AdminRecentErrorsResponse = z.infer<typeof adminRecentErrorsResponseSchema>;
