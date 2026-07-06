import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { AdminLogsResponse, MetadataStatus, RecentErrorsResponse, SyncStatus } from '../api/types';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

export function LogsPage() {
  const [logs, setLogs] = useState<AdminLogsResponse | null>(null);
  const [errors, setErrors] = useState<RecentErrorsResponse['errors']>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [logsData, errorsData, syncData, metaData] = await Promise.all([
      apiGet<AdminLogsResponse>('/api/admin/logs'),
      apiGet<RecentErrorsResponse>('/api/admin/logs/recent-errors'),
      apiGet<SyncStatus>('/api/admin/sync/status'),
      apiGet<MetadataStatus>('/api/admin/metadata/status'),
    ]);
    setLogs(logsData);
    setErrors(errorsData.errors);
    setSyncStatus(syncData);
    setMetadataStatus(metaData);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!syncStatus?.isSyncing && !metadataStatus?.isRefreshing) return;
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.isSyncing, metadataStatus?.isRefreshing, refresh]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading logs…</p>;
  }

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="mt-1 text-sm text-neutral-600">Sync history and recent server errors.</p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      <div>
        <h2 className="mb-3 font-medium">Sync runs</h2>
        <DataTable
          rows={logs?.syncRuns ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No sync runs yet."
          columns={[
            {
              key: 'started',
              header: 'Started',
              render: (row) => new Date(row.startedAt).toLocaleString(),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'games',
              header: 'Games',
              render: (row) =>
                `+${row.gamesAdded ?? 0} / ~${row.gamesUpdated ?? 0} updated`,
            },
            {
              key: 'error',
              header: 'Error',
              render: (row) => row.errorMessage ?? '—',
            },
          ]}
        />
      </div>

      <div className="rounded border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-medium">Latest metadata job</h2>
        {logs?.metadataJob ? (
          <div className="space-y-1 text-neutral-700">
            <p>
              <StatusBadge status={logs.metadataJob.status} /> · Started{' '}
              {new Date(logs.metadataJob.startedAt).toLocaleString()}
            </p>
            <p>
              Queued {logs.metadataJob.queued} · Enriched {logs.metadataJob.enriched} · Skipped{' '}
              {logs.metadataJob.skipped} · Failed {logs.metadataJob.failed}
            </p>
          </div>
        ) : (
          <p className="text-neutral-500">No metadata jobs yet.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-medium">Recent errors</h2>
        {errors.length === 0 ? (
          <p className="text-sm text-neutral-500">No recent errors.</p>
        ) : (
          <ul className="space-y-2">
            {errors.map((entry) => (
              <li key={entry.id} className="rounded border border-neutral-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  <span>{entry.source}</span>
                  <code>{entry.code}</code>
                </div>
                <p className="mt-1">{entry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
