import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../api/client';
import type { MetadataStatus, PublicSettings, SyncStatus } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

export function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [settingsData, syncData, metaData] = await Promise.all([
      apiGet<PublicSettings>('/api/admin/settings'),
      apiGet<SyncStatus>('/api/admin/sync/status'),
      apiGet<MetadataStatus>('/api/admin/metadata/status'),
    ]);
    setSettings(settingsData);
    setSyncStatus(syncData);
    setMetadataStatus(metaData);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        setBanner({
          tone: 'error',
          message: err instanceof Error ? err.message : 'Failed to load settings.',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!syncStatus?.isSyncing && !metadataStatus?.isRefreshing) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.isSyncing, metadataStatus?.isRefreshing, refresh]);

  async function saveDisplay(patch: Partial<PublicSettings['display']>) {
    if (!settings) return;
    setBusy(true);
    try {
      const body = await apiPut<PublicSettings>('/api/admin/settings', {
        display: { ...settings.display, ...patch },
      });
      setSettings(body);
      setBanner({ tone: 'success', message: 'Display settings saved.' });
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function startSync() {
    setBusy(true);
    try {
      await apiPost('/api/admin/sync');
      setBanner({ tone: 'success', message: 'Library sync started.' });
      await refresh();
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Sync failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshMetadata() {
    setBusy(true);
    try {
      await apiPost('/api/admin/metadata/refresh', {});
      setBanner({ tone: 'success', message: 'Metadata refresh started.' });
      await refresh();
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Metadata refresh failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-neutral-500">Loading settings…</p>;
  }

  return (
    <section className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">Ongoing server and display configuration.</p>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <div className="rounded border border-neutral-200 bg-white p-4 space-y-2 text-sm">
        <h2 className="font-medium">Steam</h2>
        <p>
          API key: {settings.steam.apiKeyConfigured ? 'Configured' : 'Not set'}
        </p>
        <p>
          Account: {settings.steam.connected ? `Connected (${settings.steam.id64})` : 'Not connected'}
        </p>
      </div>

      <div className="rounded border border-neutral-200 bg-white p-4 space-y-3 text-sm">
        <h2 className="font-medium">Display defaults</h2>
        <label className="block space-y-1">
          <span>Spine style</span>
          <select
            value={settings.display.spineStyle}
            onChange={(e) =>
              void saveDisplay({ spineStyle: e.target.value as 'image' | 'gradient' })
            }
            disabled={busy}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          >
            <option value="gradient">Gradient</option>
            <option value="image">Image</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.display.showTitle}
            onChange={(e) => void saveDisplay({ showTitle: e.target.checked })}
            disabled={busy}
          />
          Show game title on spines
        </label>
      </div>

      <div className="rounded border border-neutral-200 bg-white p-4 space-y-3 text-sm">
        <h2 className="font-medium">Library maintenance</h2>
        <p className="text-neutral-600">
          {syncStatus?.library.totalGames ?? 0} games
          {syncStatus?.isSyncing ? ' · Syncing…' : ''}
          {metadataStatus?.isRefreshing ? ' · Refreshing metadata…' : ''}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => void startSync()} disabled={busy || syncStatus?.isSyncing}>
            Sync library
          </Button>
          <Button
            variant="secondary"
            onClick={() => void refreshMetadata()}
            disabled={busy || metadataStatus?.isRefreshing}
          >
            Refresh metadata
          </Button>
        </div>
      </div>

      <div className="rounded border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-medium">Frame storage</h2>
        <p className="text-neutral-600">
          Frames stored at <code className="rounded bg-neutral-100 px-1">./data/frames</code>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Configure via <code>FRAME_STORAGE_PATH</code> in your environment file.
        </p>
      </div>
    </section>
  );
}
