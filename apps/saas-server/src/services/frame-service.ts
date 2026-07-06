import type { PrismaClient } from '@prisma/client';
import { selectGames } from '@digital-shelf-saas/core';
import { renderFrame } from '@digital-shelf-saas/renderer';
import {
  createId,
  type GamesPerFrame,
  type RenderGame,
  type SelectionMode,
  type SpineStyle,
} from '@digital-shelf-saas/shared-types';
import type { FrameStorage } from '../storage/index.js';

export class NoEligibleGamesError extends Error {
  readonly code = 'NO_ELIGIBLE_GAMES' as const;

  constructor(message = 'No eligible games found. Sync your Steam library first.') {
    super(message);
    this.name = 'NoEligibleGamesError';
  }
}

export class DeviceConfigNotFoundError extends Error {
  readonly code = 'DEVICE_NOT_FOUND' as const;

  constructor(deviceId: string) {
    super(`Device not configured: ${deviceId}`);
    this.name = 'DeviceConfigNotFoundError';
  }
}

export interface FrameSummary {
  frameId: string;
  deviceId: string;
  width: number;
  height: number;
  gameIds: string[];
  games: Array<{ id: string; name: string; publishers: string[] }>;
  generatedAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
  cached: boolean;
  spineStyle: SpineStyle;
  showTitle: boolean;
  downloadUrls: {
    png: string;
    rgb565: string;
  };
}

export interface GameArtService {
  ensureArt(game: {
    id: string;
    headerImageUrl: string | null;
    capsuleUrl: string | null;
    accentColor: string | null;
    spineTextColor: string | null;
    spineArtPath: string | null;
  }): Promise<{
    accentColor: string;
    spineTextColor: 'white' | 'black';
    spineArtPath: string | null;
  }>;
}

export interface FrameServiceDeps {
  storage: FrameStorage;
  artRootPath: string;
  resolveSpineStyle: () => Promise<SpineStyle>;
  resolveShowTitle: () => Promise<boolean>;
  gameArtService: GameArtService;
  now?: () => Date;
}

export interface FrameAccessOptions {
  userId?: string;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function createFrameService(prisma: PrismaClient, deps: FrameServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function getDeviceConfig(deviceId: string, options: FrameAccessOptions = {}) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { config: true },
    });
    if (!device?.config || (options.userId && device.userId !== options.userId)) {
      throw new DeviceConfigNotFoundError(deviceId);
    }
    return { device, config: device.config };
  }

  async function buildRenderGames(gameIds: string[]): Promise<RenderGame[]> {
    const games = await prisma.game.findMany({ where: { id: { in: gameIds } } });
    const renderGames: RenderGame[] = [];

    for (const game of games) {
      const art = await deps.gameArtService.ensureArt({
        id: game.id,
        headerImageUrl: game.headerImageUrl,
        capsuleUrl: game.capsuleUrl,
        accentColor: game.accentColor,
        spineTextColor: game.spineTextColor,
        spineArtPath: game.spineArtPath,
      });

      renderGames.push({
        id: game.id,
        name: game.name,
        publishers: parseStringArray(game.publishers),
        accentColor: art.accentColor,
        spineTextColor: art.spineTextColor,
        spineArtPath: art.spineArtPath,
      });
    }

    return renderGames;
  }

  async function getTenantAccountId(userId: string | null): Promise<string> {
    if (!userId) throw new NoEligibleGamesError();
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (!account) throw new NoEligibleGamesError();
    return account.id;
  }

  async function generateFrame(
    deviceId: string,
    spineStyle: SpineStyle,
    showTitle: boolean,
    options: FrameAccessOptions = {},
  ): Promise<FrameSummary> {
    const { device, config } = await getDeviceConfig(deviceId, options);
    const accountId = await getTenantAccountId(device.userId);

    const userGames = await prisma.userGame.findMany({
      where: { platformAccountId: accountId },
    });

    const selected = selectGames(
      userGames.map((row) => ({
        id: row.id,
        gameId: row.gameId,
        hidden: row.hidden,
        favorite: row.favorite,
        playtimeMinutes: row.playtimeMinutes,
        lastDisplayedAt: row.lastDisplayedAt,
      })),
      {
        gamesPerFrame: config.gamesPerFrame as GamesPerFrame,
        selectionMode: config.selectionMode as SelectionMode,
        avoidRecentRepeats: config.avoidRecentRepeats,
        now: now(),
      },
    );

    if (selected.length === 0) {
      throw new NoEligibleGamesError();
    }

    const gameIds = selected.map((row) => row.gameId);
    const renderGames = await buildRenderGames(gameIds);
    const rendered = await renderFrame(renderGames, {
      width: device.screenWidth,
      height: device.screenHeight,
      gamesPerFrame: config.gamesPerFrame as GamesPerFrame,
      spineStyle,
      showPublisher: config.showPublisher,
      showTitle,
      artRootPath: deps.artRootPath,
    });

    const frameId = createId('frame');
    const generatedAt = now();
    const ttlSeconds = config.rotationIntervalSeconds;
    const expiresAt = new Date(generatedAt.getTime() + ttlSeconds * 1000);

    const storagePath = await deps.storage.saveFrame(frameId, {
      png: rendered.png,
      rgb565: rendered.rgb565,
      metadata: {
        frameId,
        deviceId: device.id,
        userId: device.userId,
        gameIds,
        width: rendered.width,
        height: rendered.height,
        generatedAt: generatedAt.toISOString(),
        spineStyle,
        showTitle,
      },
    });

    await prisma.displayFrame.create({
      data: {
        id: frameId,
        deviceId: device.id,
        format: 'rgb565',
        width: rendered.width,
        height: rendered.height,
        storagePath,
        gameIds,
        generatedAt,
      },
    });

    await prisma.userGame.updateMany({
      where: { id: { in: selected.map((row) => row.id) } },
      data: { lastDisplayedAt: generatedAt },
    });

    const dbGames = await prisma.game.findMany({ where: { id: { in: gameIds } } });

    return {
      frameId,
      deviceId: device.id,
      width: rendered.width,
      height: rendered.height,
      gameIds,
      games: dbGames.map((game) => ({
        id: game.id,
        name: game.name,
        publishers: parseStringArray(game.publishers),
      })),
      generatedAt,
      expiresAt,
      ttlSeconds,
      cached: false,
      spineStyle,
      showTitle,
      downloadUrls: {
        png: `/api/device/v1/frames/${frameId}.png`,
        rgb565: `/api/device/v1/frames/${frameId}.rgb565`,
      },
    };
  }

  async function getLatestFrame(
    deviceId: string,
    options: { force?: boolean; userId?: string } = {},
  ): Promise<FrameSummary> {
    const spineStyle = await deps.resolveSpineStyle();
    const showTitle = await deps.resolveShowTitle();
    const { device, config } = await getDeviceConfig(deviceId, { userId: options.userId });
    const currentTime = now();

    if (!options.force) {
      const existing = await prisma.displayFrame.findFirst({
        where: {
          deviceId: device.id,
          device: options.userId ? { userId: options.userId } : undefined,
        },
        orderBy: { generatedAt: 'desc' },
      });

      if (existing) {
        const expiresAt = new Date(
          existing.generatedAt.getTime() + config.rotationIntervalSeconds * 1000,
        );
        if (expiresAt.getTime() > currentTime.getTime()) {
          const gameIds = parseStringArray(existing.gameIds);
          const dbGames = await prisma.game.findMany({ where: { id: { in: gameIds } } });
          return {
            frameId: existing.id,
            deviceId: existing.deviceId,
            width: existing.width,
            height: existing.height,
            gameIds,
            games: dbGames.map((game) => ({
              id: game.id,
              name: game.name,
              publishers: parseStringArray(game.publishers),
            })),
            generatedAt: existing.generatedAt,
            expiresAt,
            ttlSeconds: config.rotationIntervalSeconds,
            cached: true,
            spineStyle,
            showTitle,
            downloadUrls: {
              png: `/api/device/v1/frames/${existing.id}.png`,
              rgb565: `/api/device/v1/frames/${existing.id}.rgb565`,
            },
          };
        }
      }
    }

    return generateFrame(deviceId, spineStyle, showTitle, { userId: options.userId });
  }

  return { getLatestFrame, generateFrame };
}

export type FrameService = ReturnType<typeof createFrameService>;
