import { z } from 'zod';

export const setupStatusSchema = z.object({
  complete: z.boolean(),
  steps: z.object({
    apiKey: z.object({ done: z.boolean() }),
    steamConnected: z.object({ done: z.boolean() }),
    librarySynced: z.object({ done: z.boolean(), totalGames: z.number().int() }),
  }),
});

export type SetupStatus = z.infer<typeof setupStatusSchema>;
