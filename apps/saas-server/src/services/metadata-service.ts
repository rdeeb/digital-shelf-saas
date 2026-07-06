import type { Prisma, PrismaClient } from '@prisma/client';
import {
  getAppDetails,
  SteamError,
  type NormalizedAppMetadata,
} from '@digital-shelf-saas/platform-steam';
import { createId } from '@digital-shelf-saas/shared-types';
import {
  METADATA_BACKOFF_BASE_MS,
  METADATA_CACHE_TTL_DAYS,
  METADATA_MAX_RETRIES,
  METADATA_REQUEST_DELAY_MS,
  METADATA_REQUEST_TIMEOUT_MS,
} from '../config/metadata.js';
import {
  clearActiveMetadataJob,
  getActiveMetadataJobId,
  setActiveMetadataJobId,
} from '../lib/metadata-tracker.js';
import { pushAdminError } from '../lib/admin-log-buffer.js';
import { getActiveSyncRunId } from '../lib/sync-tracker.js';

export interface EnrichGamesResult {
  queued: number;
  enriched: number;
  skipped: number;
  failed: number;
}

export interface MetadataJobState {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  queued: number;
  enriched: number;
  skipped: number;
  failed: number;
  force: boolean;
}

type GetAppDetailsImpl = (params: { appId: string }) => Promise<NormalizedAppMetadata>;
type SleepFn = (ms: number) => Promise<void>;

export interface MetadataServiceDeps {
  getAppDetailsImpl?: GetAppDetailsImpl;
  sleep?: SleepFn;
  now?: () => Date;
  delayMs?: number;
  timeoutMs?: number;
  cacheTtlDays?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  scheduleJob?: (job: () => Promise<void>) => void;
}

export class MetadataRefreshInProgressError extends Error {
  readonly code = 'METADATA_REFRESH_IN_PROGRESS' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MetadataRefreshInProgressError';
  }
}

export class SyncInProgressError extends Error {
  readonly code = 'SYNC_IN_PROGRESS' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SyncInProgressError';
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function shouldSkipEnrichment(
  game: {
    metadataUpdatedAt: Date | null;
    developers: unknown;
    publishers: unknown;
  },
  force: boolean,
  currentTime: Date,
  cacheTtlDays: number,
): boolean {
  if (force) return false;
  if (!game.metadataUpdatedAt) return false;

  const developers = parseStringArray(game.developers);
  const publishers = parseStringArray(game.publishers);
  const hasMetadata = developers.length > 0 || publishers.length > 0;
  if (!hasMetadata) return false;

  const ttlMs = cacheTtlDays * 24 * 60 * 60 * 1000;
  return currentTime.getTime() - game.metadataUpdatedAt.getTime() < ttlMs;
}

function isRetryableSteamError(error: unknown): boolean {
  return (
    error instanceof SteamError &&
    (error.code === 'STEAM_RATE_LIMITED' || error.code === 'STEAM_API_ERROR')
  );
}

const latestJobStateByUser = new Map<string, MetadataJobState>();
const activeJobByUser = new Map<string, Promise<void>>();

export function createMetadataService(prisma: PrismaClient, deps: MetadataServiceDeps = {}) {
  const timeoutMs = deps.timeoutMs ?? METADATA_REQUEST_TIMEOUT_MS;
  const getAppDetailsImpl =
    deps.getAppDetailsImpl ??
    ((params) => getAppDetails({ appId: params.appId }, { timeoutMs }));
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => new Date());
  const delayMs = deps.delayMs ?? METADATA_REQUEST_DELAY_MS;
  const cacheTtlDays = deps.cacheTtlDays ?? METADATA_CACHE_TTL_DAYS;
  const maxRetries = deps.maxRetries ?? METADATA_MAX_RETRIES;
  const backoffBaseMs = deps.backoffBaseMs ?? METADATA_BACKOFF_BASE_MS;
  const scheduleJob = deps.scheduleJob ?? ((job) => {
    void job();
  });

  async function fetchWithRetries(externalId: string): Promise<NormalizedAppMetadata> {
    let attempt = 0;
    while (true) {
      try {
        return await getAppDetailsImpl({ appId: externalId });
      } catch (error) {
        if (error instanceof SteamError && error.code === 'STEAM_APP_NOT_FOUND') {
          throw error;
        }
        const canRetry = isRetryableSteamError(error) && attempt < maxRetries;
        if (!canRetry) throw error;
        await sleep(backoffBaseMs * 2 ** attempt);
        attempt += 1;
      }
    }
  }

  async function enrichGames(
    gameIds: string[],
    options: { force?: boolean } = {},
  ): Promise<EnrichGamesResult> {
    const force = options.force ?? false;
    const currentTime = now();
    const games = await prisma.game.findMany({ where: { id: { in: gameIds } } });

    const result: EnrichGamesResult = { queued: 0, enriched: 0, skipped: 0, failed: 0 };

    for (const game of games) {
      if (shouldSkipEnrichment(game, force, currentTime, cacheTtlDays)) {
        result.skipped += 1;
        continue;
      }

      result.queued += 1;
      try {
        const metadata = await fetchWithRetries(game.externalId);
        await prisma.game.update({
          where: { id: game.id },
          data: {
            developers: metadata.developers,
            publishers: metadata.publishers,
            name: metadata.name || game.name,
            headerImageUrl: metadata.headerImageUrl,
            capsuleUrl: metadata.capsuleImageUrl,
            metadataJson: metadata.metadataJson as Prisma.InputJsonValue,
            metadataUpdatedAt: now(),
          },
        });
        result.enriched += 1;
      } catch {
        result.failed += 1;
      }
      await sleep(delayMs);
    }

    return result;
  }

  async function runRefreshJob(userId: string, jobId: string, force: boolean): Promise<void> {
    try {
      latestJobStateByUser.set(userId, {
        id: jobId,
        status: 'running',
        startedAt: latestJobStateByUser.get(userId)?.startedAt ?? now(),
        completedAt: null,
        queued: 0,
        enriched: 0,
        skipped: 0,
        failed: 0,
        force,
      });

      const account = await prisma.platformAccount.findUnique({
        where: { userId_platform: { userId, platform: 'steam' } },
      });
      if (!account) {
        const state = latestJobStateByUser.get(userId)!;
        latestJobStateByUser.set(userId, { ...state, status: 'completed', completedAt: now() });
        return;
      }

      const userGames = await prisma.userGame.findMany({
        where: { platformAccountId: account.id },
        select: { gameId: true },
      });
      const counters = await enrichGames(
        userGames.map((row) => row.gameId),
        { force },
      );

      const state = latestJobStateByUser.get(userId)!;
      latestJobStateByUser.set(userId, {
        ...state,
        status: 'completed',
        completedAt: now(),
        ...counters,
      });
    } catch {
      const state = latestJobStateByUser.get(userId);
      if (state) {
        latestJobStateByUser.set(userId, { ...state, status: 'failed', completedAt: now() });
      }
      pushAdminError({
        code: 'METADATA_REFRESH_FAILED',
        message: 'Metadata refresh failed due to an unexpected error.',
        source: 'metadata',
        context: { metadataJobId: jobId, userId },
      });
    } finally {
      clearActiveMetadataJob(userId);
      activeJobByUser.delete(userId);
    }
  }

  async function startRefresh(userId: string, options: { force?: boolean } = {}) {
    if (getActiveSyncRunId(userId)) {
      throw new SyncInProgressError(
        'Metadata refresh cannot start while a Steam library sync is in progress.',
      );
    }

    const activeJobId = getActiveMetadataJobId(userId);
    const latestJobState = latestJobStateByUser.get(userId);
    if (activeJobId && latestJobState) {
      return { metadataJobId: activeJobId, status: latestJobState.status };
    }

    const force = options.force ?? false;
    const jobId = createId('metadata');
    latestJobStateByUser.set(userId, {
      id: jobId,
      status: 'pending',
      startedAt: now(),
      completedAt: null,
      queued: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      force,
    });

    setActiveMetadataJobId(userId, jobId);
    const job = runRefreshJob(userId, jobId, force);
    activeJobByUser.set(userId, job);
    scheduleJob(() => job);

    return { metadataJobId: jobId, status: 'pending' as const };
  }

  async function getStatus(userId: string) {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    const totalGames = account
      ? await prisma.userGame.count({ where: { platformAccountId: account.id } })
      : 0;

    const games = await prisma.game.findMany({
      where: account ? { userGames: { some: { platformAccountId: account.id } } } : { id: '__none__' },
      select: { publishers: true, metadataUpdatedAt: true },
    });

    let withPublisher = 0;
    let withoutPublisher = 0;
    let lastEnrichedAt: Date | null = null;

    for (const game of games) {
      if (parseStringArray(game.publishers).length > 0) withPublisher += 1;
      else withoutPublisher += 1;
      if (game.metadataUpdatedAt && (!lastEnrichedAt || game.metadataUpdatedAt > lastEnrichedAt)) {
        lastEnrichedAt = game.metadataUpdatedAt;
      }
    }

    const latestJobState = latestJobStateByUser.get(userId);

    return {
      metadataJob: latestJobState
        ? {
            id: latestJobState.id,
            status: latestJobState.status,
            startedAt: latestJobState.startedAt.toISOString(),
            completedAt: latestJobState.completedAt?.toISOString() ?? null,
            queued: latestJobState.queued,
            enriched: latestJobState.enriched,
            skipped: latestJobState.skipped,
            failed: latestJobState.failed,
          }
        : null,
      library: {
        totalGames,
        withPublisher,
        withoutPublisher,
        lastEnrichedAt: lastEnrichedAt?.toISOString() ?? null,
      },
      isRefreshing: getActiveMetadataJobId(userId) !== null,
    };
  }

  async function waitForActiveJob(userId: string): Promise<void> {
    const job = activeJobByUser.get(userId);
    if (job) await job;
  }

  return { enrichGames, startRefresh, getStatus, waitForActiveJob };
}

export type MetadataService = ReturnType<typeof createMetadataService>;
