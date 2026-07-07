import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { NormalizedOwnedGame } from '@digital-shelf-saas/platform-steam';
import { SteamError } from '@digital-shelf-saas/platform-steam';
import { createId } from '@digital-shelf-saas/shared-types';
import { clearAllActiveSyncRuns } from '../lib/sync-tracker.js';
import { createMetadataService } from './metadata-service.js';
import { createSteamSyncService, resetSteamLibraryForUser } from './steam-sync-service.js';

const prisma = new PrismaClient();

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/platform-steam/src/fixtures',
);
const ownedGamesFixture: NormalizedOwnedGame[] = JSON.parse(
  readFileSync(path.join(fixtureDir, 'get-owned-games.json'), 'utf8'),
).response.games.map((game: {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  img_logo_url: string;
}) => ({
  externalId: String(game.appid),
  name: game.name,
  playtimeMinutes: game.playtime_forever,
  capsuleUrl: game.img_icon_url
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
    : null,
  headerImageUrl: game.img_logo_url
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
    : null,
  metadataJson: game,
}));

function createTestMetadataService() {
  return createMetadataService(prisma, {
    getAppDetailsImpl: async ({ appId }) => ({
      externalId: appId,
      name: `Game ${appId}`,
      developers: ['Dev Co'],
      publishers: ['Pub Co'],
      metadataJson: { name: `Game ${appId}` },
    }),
    sleep: async () => undefined,
  });
}

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-sync@example.com`,
      passwordHash: 'hash',
      activationState: 'active',
      steamId64: `${Date.now()}76561198000000000`,
    },
  });
}

describe('steam-sync-service', () => {
  function createTestSyncService(
    overrides: Parameters<typeof createSteamSyncService>[2] = {},
  ) {
    return createSteamSyncService(
      prisma,
      { steamApiKey: 'test-api-key' },
      {
        metadataService: createTestMetadataService(),
        scheduleJob: (job) => job(),
        ...overrides,
      },
    );
  }

  beforeEach(async () => {
    clearAllActiveSyncRuns();
    await prisma.displayFrame.deleteMany();
    await prisma.deviceConfig.deleteMany();
    await prisma.device.deleteMany();
    await prisma.userGame.deleteMany();
    await prisma.game.deleteMany();
    await prisma.syncRun.deleteMany();
    await prisma.platformAccount.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('upserts games and user_games from owned games', async () => {
    const user = await createTestUser();
    const service = createTestSyncService({
      getOwnedGamesImpl: async () => ownedGamesFixture,
    });

    const started = await service.startSync(user.id);
    await service.waitForActiveSync(user.id);

    const syncRun = await prisma.syncRun.findUnique({ where: { id: started.syncRunId } });
    expect(syncRun?.status).toBe('completed');
    expect(syncRun?.gamesDiscovered).toBe(2);
    expect(syncRun?.gamesAdded).toBe(2);

    const userGames = await prisma.userGame.findMany();
    expect(userGames).toHaveLength(2);
  });

  it('removes orphaned user_games', async () => {
    const user = await createTestUser();
    const service = createTestSyncService({
      getOwnedGamesImpl: async () => ownedGamesFixture,
    });

    await service.startSync(user.id);
    await service.waitForActiveSync(user.id);

    const orphanGame = await prisma.game.create({
      data: {
        id: 'game_orphan',
        platform: 'steam',
        externalId: '999',
        name: 'Orphan Game',
        developers: [],
        publishers: [],
      },
    });
    const account = await prisma.platformAccount.findFirstOrThrow();
    await prisma.userGame.create({
      data: {
        id: 'ug_orphan',
        gameId: orphanGame.id,
        platformAccountId: account.id,
        hidden: false,
        favorite: false,
      },
    });

    await service.startSync(user.id);
    await service.waitForActiveSync(user.id);

    const remaining = await prisma.userGame.findMany();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((row) => row.id !== 'ug_orphan')).toBe(true);
  });

  it('marks sync_run failed on Steam errors', async () => {
    const user = await createTestUser();
    const service = createTestSyncService({
      getOwnedGamesImpl: async () => {
        throw new SteamError(
          'STEAM_API_ERROR',
          'Steam API request failed with status 403. Check that your API key is valid.',
        );
      },
    });

    await service.startSync(user.id);
    await service.waitForActiveSync(user.id);

    const syncRun = await prisma.syncRun.findFirstOrThrow({ orderBy: { startedAt: 'desc' } });
    expect(syncRun.status).toBe('failed');
    expect(syncRun.errorCode).toBe('STEAM_API_ERROR');
  });

  it('runs metadata enrichment as sync phase 2 and records counters', async () => {
    const user = await createTestUser();
    const enrichGames = vi.fn(async () => ({
      queued: 2,
      enriched: 2,
      skipped: 0,
      failed: 0,
    }));

    const service = createSteamSyncService(
      prisma,
      { steamApiKey: 'test-api-key' },
      {
        getOwnedGamesImpl: async () => ownedGamesFixture,
        scheduleJob: (job) => job(),
        metadataService: { enrichGames } as unknown as ReturnType<typeof createMetadataService>,
      },
    );

    const started = await service.startSync(user.id);
    await service.waitForActiveSync(user.id);

    const syncRun = await prisma.syncRun.findUniqueOrThrow({ where: { id: started.syncRunId } });
    expect(syncRun.status).toBe('completed');
    expect(syncRun.metadataQueued).toBe(2);
    expect(enrichGames).toHaveBeenCalledTimes(1);
  });

  it('resets steam-derived library data without deleting subscriptions', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-reset@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000456`,
        subscription: {
          create: {
            id: createId('subscription'),
            planId: 'plan_basic',
            provider: 'paypal',
            status: 'active',
            billingCycle: 'monthly',
          },
        },
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: user.steamId64!,
      },
    });
    const game = await prisma.game.create({
      data: {
        id: createId('game'),
        platform: 'steam',
        externalId: `${Date.now()}-game`,
        name: 'Reset Me',
        developers: [],
        publishers: [],
      },
    });
    await prisma.userGame.create({
      data: {
        id: createId('userGame'),
        gameId: game.id,
        platformAccountId: platformAccount.id,
        hidden: false,
        favorite: false,
      },
    });
    await prisma.syncRun.create({
      data: {
        id: createId('sync'),
        platformAccountId: platformAccount.id,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await resetSteamLibraryForUser(prisma, user.id);

    expect(await prisma.platformAccount.count({ where: { userId: user.id, platform: 'steam' } })).toBe(0);
    expect(await prisma.userGame.count()).toBe(0);
    expect(await prisma.syncRun.count()).toBe(0);
    expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).not.toBeNull();
  });
});
