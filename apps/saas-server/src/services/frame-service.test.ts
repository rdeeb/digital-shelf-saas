import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrameService, NoEligibleGamesError } from './frame-service.js';
import type { FrameStorage } from '../storage/index.js';

vi.mock('@digital-shelf-saas/renderer', () => ({
  renderFrame: vi.fn(async () => ({
    png: Buffer.from('png'),
    rgb565: Buffer.from('rgb565'),
    width: 172,
    height: 320,
  })),
}));

const userA = 'user-a';
const userB = 'user-b';
const deviceId = 'device-a';
const now = new Date('2026-07-05T12:00:00.000Z');

function makePrisma(accountUserId: string) {
  const device = {
    id: deviceId,
    userId: userA,
    screenWidth: 172,
    screenHeight: 320,
    config: {
      gamesPerFrame: 1,
      rotationIntervalSeconds: 300,
      selectionMode: 'random',
      showPublisher: true,
      showPlaytime: false,
      avoidRecentRepeats: false,
    },
  };
  const account = { id: 'plat-1', userId: accountUserId, platform: 'steam' };
  const game = {
    id: 'game-1',
    name: 'Tenant Game',
    publishers: ['Publisher'],
    headerImageUrl: null,
    capsuleUrl: null,
    accentColor: '#000000',
    spineTextColor: 'white',
    spineArtPath: null,
  };
  const userGame = {
    id: 'ug-1',
    gameId: game.id,
    platformAccountId: account.id,
    hidden: false,
    favorite: false,
    playtimeMinutes: 10,
    lastDisplayedAt: null,
  };

  return {
    device: {
      findUnique: vi.fn(async () => device),
    },
    platformAccount: {
      findUnique: vi.fn(async ({ where }) =>
        where.userId_platform.userId === account.userId ? account : null,
      ),
    },
    userGame: {
      findMany: vi.fn(async ({ where }) =>
        where.platformAccountId === account.id ? [userGame] : [],
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    game: {
      findMany: vi.fn(async ({ where }) =>
        where.id.in.includes(game.id) ? [game] : [],
      ),
    },
    displayFrame: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
  };
}

function makeStorage(): FrameStorage {
  return {
    saveFrame: vi.fn(async (frameId) => `${frameId}/${frameId}`),
    readFrameFile: vi.fn(),
  };
}

describe('frame-service tenant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects games only from platform account owned by device user', async () => {
    const prisma = makePrisma(userA);
    const frameService = createFrameService(prisma as unknown as PrismaClient, {
      storage: makeStorage(),
      artRootPath: '/tmp/art',
      resolveSpineStyle: async () => 'gradient',
      resolveShowTitle: async () => true,
      gameArtService: {
        ensureArt: vi.fn(async (game) => ({
          accentColor: game.accentColor ?? '#000000',
          spineTextColor: game.spineTextColor ?? 'white',
          spineArtPath: game.spineArtPath ?? null,
        })),
      },
      now: () => now,
    });

    const frame = await frameService.generateFrame(deviceId, 'gradient', true);

    expect(frame.gameIds).toEqual(['game-1']);
    expect(prisma.platformAccount.findUnique).toHaveBeenCalledWith({
      where: { userId_platform: { userId: userA, platform: 'steam' } },
    });
  });

  it('does not use another tenant platform account when device user has none', async () => {
    const prisma = makePrisma(userB);
    const frameService = createFrameService(prisma as unknown as PrismaClient, {
      storage: makeStorage(),
      artRootPath: '/tmp/art',
      resolveSpineStyle: async () => 'gradient',
      resolveShowTitle: async () => true,
      gameArtService: {
        ensureArt: vi.fn(),
      },
      now: () => now,
    });

    await expect(frameService.generateFrame(deviceId, 'gradient', true)).rejects.toBeInstanceOf(
      NoEligibleGamesError,
    );
  });

  it('rejects cached frame access when requested user does not own device', async () => {
    const prisma = makePrisma(userA);
    prisma.displayFrame.findFirst.mockResolvedValueOnce({
      id: 'frame_cached',
      deviceId,
      width: 172,
      height: 320,
      gameIds: ['game-1'],
      generatedAt: now,
    });
    const frameService = createFrameService(prisma as unknown as PrismaClient, {
      storage: makeStorage(),
      artRootPath: '/tmp/art',
      resolveSpineStyle: async () => 'gradient',
      resolveShowTitle: async () => true,
      gameArtService: {
        ensureArt: vi.fn(),
      },
      now: () => now,
    });

    await expect(
      frameService.getLatestFrame(deviceId, { userId: userB }),
    ).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });
    expect(prisma.displayFrame.findFirst).not.toHaveBeenCalled();
  });
});
