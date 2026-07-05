import { createId } from '@digital-shelf-saas/shared-types';

export type AdminErrorSource = 'sync' | 'metadata' | 'frame' | 'device';

export interface AdminErrorEntry {
  id: string;
  timestamp: string;
  code: string;
  message: string;
  source: AdminErrorSource;
  context?: Record<string, string>;
}

export interface PushAdminErrorInput {
  code: string;
  message: string;
  source: AdminErrorSource;
  context?: Record<string, string>;
}

const MAX_ENTRIES = 50;
const buffer: AdminErrorEntry[] = [];

export function pushAdminError(input: PushAdminErrorInput): void {
  buffer.push({
    id: createId('err'),
    timestamp: new Date().toISOString(),
    code: input.code,
    message: input.message,
    source: input.source,
    context: input.context,
  });

  while (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

export function getRecentErrors(): AdminErrorEntry[] {
  return [...buffer].reverse();
}

export function clearAdminLogBuffer(): void {
  buffer.length = 0;
}
