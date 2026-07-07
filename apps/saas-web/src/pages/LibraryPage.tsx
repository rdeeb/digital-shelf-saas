import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../api/client';
import type { GameListItem, GamesResponse } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';

type PublisherFilter = 'all' | 'has' | 'missing';
type SortOption = 'name' | 'playtime' | 'recently_synced';

export function buildLibraryPath(params: URLSearchParams): string {
  return `/library?${params}`;
}

export function getLibrarySyncPath(): string {
  return '/library/sync';
}

export function buildLibraryGamePath(userGameId: string): string {
  return `/library/games/${userGameId}`;
}

export function shouldShowNoSyncedGames(input: {
  loading: boolean;
  total: number;
  search: string;
  favoriteFilter: 'all' | 'true' | 'false';
  hiddenFilter: 'all' | 'true' | 'false';
  publisherFilter: PublisherFilter;
}): boolean {
  if (input.loading || input.total !== 0) return false;
  return (
    input.search.trim() === '' &&
    input.favoriteFilter === 'all' &&
    input.hiddenFilter === 'all' &&
    input.publisherFilter === 'all'
  );
}

export function LibraryPage() {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'true' | 'false'>('all');
  const [hiddenFilter, setHiddenFilter] = useState<'all' | 'true' | 'false'>('all');
  const [publisherFilter, setPublisherFilter] = useState<PublisherFilter>('all');
  const [sort, setSort] = useState<SortOption>('name');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort,
        publisherStatus: publisherFilter,
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (favoriteFilter !== 'all') params.set('favorite', favoriteFilter);
      if (hiddenFilter !== 'all') params.set('hidden', hiddenFilter);

      const gamesData = await apiGet<GamesResponse>(buildLibraryPath(params));
      setGames(gamesData.games);
      setPagination(gamesData.pagination);
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Failed to load library.',
      });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, favoriteFilter, hiddenFilter, publisherFilter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleField(userGameId: string, field: 'favorite' | 'hidden', value: boolean) {
    try {
      await apiPatch(buildLibraryGamePath(userGameId), { [field]: value });
      await load();
    } catch (err) {
      setBanner({ tone: 'error', message: err instanceof Error ? err.message : 'Update failed.' });
    }
  }

  async function startSync() {
    setSyncing(true);
    setBanner(null);
    try {
      await apiPost(getLibrarySyncPath());
      await load();
      setBanner({ tone: 'success', message: 'Library sync started.' });
    } catch (err) {
      setBanner({ tone: 'error', message: err instanceof Error ? err.message : 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  }

  const noGames = shouldShowNoSyncedGames({
    loading,
    total: pagination.total,
    search,
    favoriteFilter,
    hiddenFilter,
    publisherFilter,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="mt-1 text-sm text-neutral-600">{pagination.total} games</p>
        </div>
        <Button onClick={() => void startSync()} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync library'}
        </Button>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading games...</p>
      ) : noGames ? (
        <div className="rounded border border-neutral-200 bg-white p-6 text-sm">
          <p>No games synced yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search games..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              value={favoriteFilter}
              onChange={(e) => {
                setFavoriteFilter(e.target.value as typeof favoriteFilter);
                setPage(1);
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="all">All favorites</option>
              <option value="true">Favorites only</option>
              <option value="false">Non-favorites</option>
            </select>
            <select
              value={hiddenFilter}
              onChange={(e) => {
                setHiddenFilter(e.target.value as typeof hiddenFilter);
                setPage(1);
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="all">All visibility</option>
              <option value="false">Visible</option>
              <option value="true">Hidden</option>
            </select>
            <select
              value={publisherFilter}
              onChange={(e) => {
                setPublisherFilter(e.target.value as PublisherFilter);
                setPage(1);
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="all">All publishers</option>
              <option value="has">Has publisher</option>
              <option value="missing">Missing publisher</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="name">Sort: Name</option>
              <option value="playtime">Sort: Playtime</option>
              <option value="recently_synced">Sort: Recently synced</option>
            </select>
          </div>

          <DataTable
            rows={games}
            rowKey={(row) => row.userGameId}
            emptyMessage="No games match these filters."
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.name },
              {
                key: 'publishers',
                header: 'Publisher',
                render: (row) => (row.publishers.length > 0 ? row.publishers.join(', ') : '-'),
              },
              {
                key: 'playtime',
                header: 'Playtime',
                render: (row) => `${row.playtimeMinutes ?? 0} min`,
              },
              {
                key: 'favorite',
                header: 'Favorite',
                render: (row) => (
                  <input
                    type="checkbox"
                    checked={row.favorite}
                    onChange={(e) => void toggleField(row.userGameId, 'favorite', e.target.checked)}
                  />
                ),
              },
              {
                key: 'hidden',
                header: 'Hidden',
                render: (row) => (
                  <input
                    type="checkbox"
                    checked={row.hidden}
                    onChange={(e) => void toggleField(row.userGameId, 'hidden', e.target.checked)}
                  />
                ),
              },
            ]}
          />

          {pagination.totalPages > 1 ? (
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-neutral-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
