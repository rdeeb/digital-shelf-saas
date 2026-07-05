import type { PrismaClient } from '@prisma/client';
import type {
  AdminGameListItem,
  AdminGamePatch,
  AdminGamesQuery,
  AdminGamesResponse,
} from '@digital-shelf-saas/device-protocol';

export class LibraryServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 404,
  ) {
    super(message);
    this.name = 'LibraryServiceError';
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function hasPublishers(value: unknown): boolean {
  return parseStringArray(value).length > 0;
}

export function createLibraryService(prisma: PrismaClient) {
  async function getAccountId(userId: string): Promise<string | null> {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    return account?.id ?? null;
  }

  async function listGames(userId: string, query: AdminGamesQuery): Promise<AdminGamesResponse> {
    const accountId = await getAccountId(userId);
    if (!accountId) {
      return {
        games: [],
        pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
      };
    }

    const where: {
      platformAccountId: string;
      favorite?: boolean;
      hidden?: boolean;
      game?: { name?: { contains: string } };
    } = { platformAccountId: accountId };

    if (query.favorite !== undefined) where.favorite = query.favorite;
    if (query.hidden !== undefined) where.hidden = query.hidden;
    if (query.q) where.game = { name: { contains: query.q } };

    const orderBy =
      query.sort === 'playtime'
        ? { playtimeMinutes: 'desc' as const }
        : query.sort === 'recently_synced'
          ? { updatedAt: 'desc' as const }
          : { game: { name: 'asc' as const } };

    const rows = await prisma.userGame.findMany({
      where,
      include: { game: true },
      orderBy,
    });

    const filtered =
      query.publisherStatus === 'all'
        ? rows
        : rows.filter((row) => {
            const has = hasPublishers(row.game.publishers);
            return query.publisherStatus === 'has' ? has : !has;
          });

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    const start = (query.page - 1) * query.limit;
    const pageRows = filtered.slice(start, start + query.limit);

    const games: AdminGameListItem[] = pageRows.map((row) => ({
      userGameId: row.id,
      gameId: row.gameId,
      name: row.game.name,
      publishers: parseStringArray(row.game.publishers),
      playtimeMinutes: row.playtimeMinutes,
      favorite: row.favorite,
      hidden: row.hidden,
      metadataUpdatedAt: row.game.metadataUpdatedAt?.toISOString() ?? null,
    }));

    return {
      games,
      pagination: { page: query.page, limit: query.limit, total, totalPages },
    };
  }

  async function updateUserGame(
    userId: string,
    userGameId: string,
    patch: AdminGamePatch,
  ): Promise<AdminGameListItem> {
    const accountId = await getAccountId(userId);
    const existing = await prisma.userGame.findUnique({
      where: { id: userGameId },
      include: { game: true },
    });
    if (!existing || existing.platformAccountId !== accountId) {
      throw new LibraryServiceError('USER_GAME_NOT_FOUND', `User game not found: ${userGameId}`);
    }

    const updated = await prisma.userGame.update({
      where: { id: userGameId },
      data: {
        favorite: patch.favorite ?? existing.favorite,
        hidden: patch.hidden ?? existing.hidden,
      },
      include: { game: true },
    });

    return {
      userGameId: updated.id,
      gameId: updated.gameId,
      name: updated.game.name,
      publishers: parseStringArray(updated.game.publishers),
      playtimeMinutes: updated.playtimeMinutes,
      favorite: updated.favorite,
      hidden: updated.hidden,
      metadataUpdatedAt: updated.game.metadataUpdatedAt?.toISOString() ?? null,
    };
  }

  return { listGames, updateUserGame };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
