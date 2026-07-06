import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../api/client';
import type { GameListItem, GamesResponse, MetadataStatus, SyncStatus } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';

type PublisherFilter = 'all' | 'has' | 'missing';
type SortOption = 'name' | 'playtime' | 'recently_synced';

export function LibraryPage() {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'true' | 'false'>('all');
  const [hiddenFilter, setHiddenFilter] = useState<'all' | 'true' | 'false'>('all');
  const [publisherFilter, setPublisherFilter] = useState<PublisherFilter>('all');
  const [sort, setSort] = useState<SortOption>('name');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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

      const [gamesData, syncData, metaData] = await Promise.all([
        apiGet<GamesResponse>(`/api/admin/games?${params}`),
        apiGet<SyncStatus>('/api/admin/sync/status'),
        apiGet<MetadataStatus>('/api/admin/metadata/status'),
      ]);
      setGames(gamesData.games);
      setPagination(gamesData.pagination);
      setSyncStatus(syncData);
      setMetadataStatus(metaData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, favoriteFilter, hiddenFilter, publisherFilter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleField(userGameId: string, field: 'favorite' | 'hidden', value: boolean) {
    try {
      await apiPatch(`/api/admin/games/${userGameId}`, { [field]: value });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  }

  const noGames = (syncStatus?.library.totalGames ?? 0) === 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {syncStatus?.library.totalGames ?? 0} games
          {syncStatus?.library.lastSyncAt
            ? ` · Last sync ${new Date(syncStatus.library.lastSyncAt).toLocaleString()}`
            : ''}
          {metadataStatus
            ? ` · Publishers: ${metadataStatus.library.withPublisher} yes / ${metadataStatus.library.withoutPublisher} missing`
            : ''}
        </p>
      </div>

      {error ? <Banner tone="error" message={error} /> : null}

      {noGames ? (
        <div className="rounded border border-neutral-200 bg-white p-6 text-sm">
          <p>No games synced yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search games…"
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

          {loading ? (
            <p className="text-sm text-neutral-500">Loading games…</p>
          ) : (
            <DataTable
              rows={games}
              rowKey={(row) => row.userGameId}
              emptyMessage="No games match these filters."
              columns={[
                { key: 'name', header: 'Name', render: (row) => row.name },
                {
                  key: 'publishers',
                  header: 'Publisher',
                  render: (row) =>
                    row.publishers.length > 0 ? row.publishers.join(', ') : '—',
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
          )}

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
