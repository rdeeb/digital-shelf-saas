import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from './register.js';
import { claimStatusQuerySchema } from './claim-status.js';
import { adminClaimRequestSchema } from './admin-devices.js';
import {
  adminGamePatchSchema,
  adminGamesQuerySchema,
  adminGamesResponseSchema,
} from './admin-library.js';
import { adminLogsResponseSchema, adminRecentErrorsResponseSchema } from './admin-logs.js';
import { setupStatusSchema } from './admin-setup.js';

describe('device-protocol schemas', () => {
  it('accepts valid register request', () => {
    const result = registerRequestSchema.parse({
      hardwareId: 'esp32-aabbccddeeff',
      deviceName: 'Digital Shelf',
    });
    expect(result.hardwareId).toBe('esp32-aabbccddeeff');
  });

  it('rejects register request without hardwareId', () => {
    expect(() => registerRequestSchema.parse({})).toThrow();
  });

  it('accepts claim-status query', () => {
    const result = claimStatusQuerySchema.parse({
      deviceId: 'dev_abc',
      hardwareId: 'esp32-aabbccddeeff',
    });
    expect(result.deviceId).toBe('dev_abc');
  });

  it('accepts admin claim request', () => {
    const result = adminClaimRequestSchema.parse({ claimCode: '483921' });
    expect(result.claimCode).toBe('483921');
  });
});

describe('admin library schemas', () => {
  it('accepts valid games query', () => {
    expect(adminGamesQuerySchema.parse({ page: 1, limit: 50, sort: 'name' })).toEqual({
      page: 1,
      limit: 50,
      sort: 'name',
      publisherStatus: 'all',
    });
  });

  it('rejects invalid publisherStatus', () => {
    expect(() => adminGamesQuerySchema.parse({ publisherStatus: 'bogus' })).toThrow();
  });

  it('accepts game patch with favorite', () => {
    expect(adminGamePatchSchema.parse({ favorite: true })).toEqual({ favorite: true });
  });

  it('rejects empty game patch', () => {
    expect(() => adminGamePatchSchema.parse({})).toThrow();
  });

  it('accepts games response shape', () => {
    const result = adminGamesResponseSchema.parse({
      games: [
        {
          userGameId: 'ug_1',
          gameId: 'game_1',
          name: 'Portal',
          publishers: ['Valve'],
          playtimeMinutes: 60,
          favorite: false,
          hidden: false,
          metadataUpdatedAt: '2026-07-02T12:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    expect(result.games).toHaveLength(1);
  });
});

describe('admin setup schema', () => {
  it('accepts setup status', () => {
    expect(
      setupStatusSchema.parse({
        complete: false,
        steps: {
          apiKey: { done: true },
          steamConnected: { done: false },
          librarySynced: { done: false, totalGames: 0 },
        },
      }),
    ).toBeTruthy();
  });
});

describe('admin logs schemas', () => {
  it('accepts logs response', () => {
    expect(
      adminLogsResponseSchema.parse({
        syncRuns: [],
        metadataJob: null,
      }),
    ).toBeTruthy();
  });

  it('accepts recent errors response', () => {
    expect(
      adminRecentErrorsResponseSchema.parse({
        errors: [
          {
            id: 'err_1',
            timestamp: '2026-07-02T10:00:00.000Z',
            code: 'STEAM_API_ERROR',
            message: 'Invalid key',
            source: 'sync',
            context: { syncRunId: 'sync_1' },
          },
        ],
      }),
    ).toBeTruthy();
  });
});
