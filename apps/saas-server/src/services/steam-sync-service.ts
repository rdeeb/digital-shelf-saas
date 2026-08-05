import type { PrismaClient } from '@prisma/client';
import {
  getOwnedGames,
  SteamError,
  type NormalizedOwnedGame,
} from '@digital-shelf-saas/platform-steam';
import { createId } from '@digital-shelf-saas/shared-types';
import {
  clearActiveSyncRun,
  getActiveSyncRunId,
  setActiveSyncRunId,
} from '../lib/sync-tracker.js';
import { pushAdminError } from '../lib/admin-log-buffer.js';
import { getActiveMetadataJobId } from '../lib/metadata-tracker.js';
import { createMetadataService, type MetadataService } from './metadata-service.js';

export class SteamNotConfiguredError extends Error {
  readonly code = 'STEAM_NOT_CONFIGURED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SteamNotConfiguredError';
  }
}

export class MetadataRefreshInProgressError extends Error {
  readonly code = 'METADATA_REFRESH_IN_PROGRESS' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MetadataRefreshInProgressError';
  }
}

type GetOwnedGamesImpl = (params: {
  steamId: string;
  apiKey: string;
}) => Promise<NormalizedOwnedGame[]>;

type ScheduleJob = (job: () => Promise<void>) => void;

export interface SteamSyncServiceConfig {
  steamApiKey: string;
}

export interface SteamSyncServiceDeps {
  getOwnedGamesImpl?: GetOwnedGamesImpl;
  scheduleJob?: ScheduleJob;
  metadataService?: MetadataService;
}

export interface StartSyncResult {
  syncRunId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

type SteamLibraryResetDb = Pick<PrismaClient, 'platformAccount'>;

export async function resetSteamLibraryForUser(
  prisma: SteamLibraryResetDb,
  userId: string,
): Promise<void> {
  await prisma.platformAccount.deleteMany({
    where: { userId, platform: 'steam' },
  });
}

export function createSteamSyncService(
  prisma: PrismaClient,
  config: SteamSyncServiceConfig,
  deps: SteamSyncServiceDeps = {},
) {
  const getOwnedGamesImpl =
    deps.getOwnedGamesImpl ??
    ((params) => getOwnedGames({ steamId: params.steamId, apiKey: params.apiKey }));
  const scheduleJob = deps.scheduleJob ?? ((job) => {
    void job();
  });
  const metadataService = deps.metadataService ?? createMetadataService(prisma);

  const activeJobByUser = new Map<string, Promise<void>>();

  async function requireSteamAccount(userId: string) {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (!account) {
      throw new SteamError('STEAM_API_ERROR', 'Steam account is not linked for this user.');
    }
    return account;
  }

  async function runSyncJob(userId: string, syncRunId: string): Promise<void> {
    try {
      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: { status: 'running' },
      });

      const account = await requireSteamAccount(userId);
      const steamId64 = account.externalId;
      const ownedGames = await getOwnedGamesImpl({
        steamId: steamId64,
        apiKey: config.steamApiKey,
      });

      const gameIdByExternalId = new Map<string, string>();
      let gamesAdded = 0;
      let gamesUpdated = 0;

      for (const ownedGame of ownedGames) {
        const existingGame = await prisma.game.findUnique({
          where: {
            platform_externalId: { platform: 'steam', externalId: ownedGame.externalId },
          },
        });

        const game = existingGame
          ? await prisma.game.update({
              where: { id: existingGame.id },
              data: {
                name: ownedGame.name,
                capsuleUrl: ownedGame.capsuleUrl,
                headerImageUrl: ownedGame.headerImageUrl,
                metadataJson: ownedGame.metadataJson,
              },
            })
          : await prisma.game.create({
              data: {
                id: createId('game'),
                platform: 'steam',
                externalId: ownedGame.externalId,
                name: ownedGame.name,
                developers: [],
                publishers: [],
                capsuleUrl: ownedGame.capsuleUrl,
                headerImageUrl: ownedGame.headerImageUrl,
                metadataJson: ownedGame.metadataJson,
              },
            });

        gameIdByExternalId.set(ownedGame.externalId, game.id);

        const existingUserGame = await prisma.userGame.findUnique({
          where: {
            platformAccountId_gameId: { platformAccountId: account.id, gameId: game.id },
          },
        });

        if (!existingUserGame) {
          await prisma.userGame.create({
            data: {
              id: createId('userGame'),
              gameId: game.id,
              platformAccountId: account.id,
              playtimeMinutes: ownedGame.playtimeMinutes,
              hidden: false,
              favorite: false,
            },
          });
          gamesAdded += 1;
        } else if (existingUserGame.playtimeMinutes !== ownedGame.playtimeMinutes) {
          await prisma.userGame.update({
            where: { id: existingUserGame.id },
            data: { playtimeMinutes: ownedGame.playtimeMinutes },
          });
          gamesUpdated += 1;
        }
      }

      const retainedGameIds = [...gameIdByExternalId.values()];
      await prisma.userGame.deleteMany({
        where: {
          platformAccountId: account.id,
          gameId: { notIn: retainedGameIds },
        },
      });

      const metadataResult = await metadataService.enrichGames(retainedGameIds, { force: false });

      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          gamesDiscovered: ownedGames.length,
          gamesAdded,
          gamesUpdated,
          errorCode: null,
          errorMessage: null,
          metadataQueued: metadataResult.queued,
          metadataEnriched: metadataResult.enriched,
          metadataSkipped: metadataResult.skipped,
          metadataFailed: metadataResult.failed,
        },
      });
    } catch (error) {
      const steamError = error instanceof SteamError ? error : null;
      const errorCode = steamError?.code ?? 'STEAM_API_ERROR';
      const errorMessage =
        error instanceof Error ? error.message : 'Steam library sync failed due to an unexpected error.';

      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorCode,
          errorMessage,
        },
      });

      pushAdminError({
        code: errorCode,
        message: errorMessage,
        source: 'sync',
        context: { syncRunId, userId },
      });
    } finally {
      clearActiveSyncRun(userId);
      activeJobByUser.delete(userId);
    }
  }

  async function startSync(userId: string): Promise<StartSyncResult> {
    const activeSyncRunId = getActiveSyncRunId(userId);
    if (activeSyncRunId) {
      const existing = await prisma.syncRun.findUniqueOrThrow({ where: { id: activeSyncRunId } });
      return { syncRunId: existing.id, status: existing.status as StartSyncResult['status'] };
    }

    if (getActiveMetadataJobId(userId)) {
      throw new MetadataRefreshInProgressError(
        'Steam library sync cannot start while metadata enrichment is in progress.',
      );
    }

    if (!config.steamApiKey) {
      throw new SteamNotConfiguredError(
        'Steam library sync failed because the Steam API key is missing.',
      );
    }

    const account = await requireSteamAccount(userId);
    const syncRun = await prisma.syncRun.create({
      data: {
        id: createId('sync'),
        platformAccountId: account.id,
        status: 'pending',
        startedAt: new Date(),
      },
    });

    setActiveSyncRunId(userId, syncRun.id);
    const job = runSyncJob(userId, syncRun.id);
    activeJobByUser.set(userId, job);
    scheduleJob(() => job);

    return { syncRunId: syncRun.id, status: 'pending' };
  }

  async function getSyncStatus(userId: string) {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    const latestSyncRun = account
      ? await prisma.syncRun.findFirst({
          where: { platformAccountId: account.id },
          orderBy: { startedAt: 'desc' },
        })
      : null;
    const lastCompleted = account
      ? await prisma.syncRun.findFirst({
          where: { platformAccountId: account.id, status: 'completed' },
          orderBy: { completedAt: 'desc' },
        })
      : null;
    const totalGames = account
      ? await prisma.userGame.count({ where: { platformAccountId: account.id } })
      : 0;

    return {
      syncRun: latestSyncRun,
      library: {
        totalGames,
        lastSyncAt: lastCompleted?.completedAt ?? null,
      },
      isSyncing: getActiveSyncRunId(userId) !== null,
    };
  }

  async function waitForActiveSync(userId: string): Promise<void> {
    const job = activeJobByUser.get(userId);
    if (job) await job;
  }

  return { startSync, getSyncStatus, waitForActiveSync, runSyncJob };
}

export type SteamSyncService = ReturnType<typeof createSteamSyncService>;
