import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiPut } from '../api/client';
import type { PublicSettings, SetupStatus, SyncStatus } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

function truncateSteamId(id64: string): string {
  if (id64.length < 8) return id64;
  return `${id64.slice(0, 7)}…${id64.slice(-5)}`;
}

export function SetupPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [steamId64, setSteamId64] = useState('');
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [settingsData, setupData, syncData] = await Promise.all([
      apiGet<PublicSettings>('/api/admin/settings'),
      apiGet<SetupStatus>('/api/admin/setup/status'),
      apiGet<SyncStatus>('/api/admin/sync/status'),
    ]);
    setSettings(settingsData);
    setSetupStatus(setupData);
    setSyncStatus(syncData);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch {
        setBanner({ tone: 'error', message: 'Could not load setup settings.' });
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!syncStatus?.isSyncing) return;
    const timer = window.setInterval(() => {
      void apiGet<SyncStatus>('/api/admin/sync/status').then(setSyncStatus);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.isSyncing]);

  useEffect(() => {
    const steamStatus = searchParams.get('steam');
    const errorCode = searchParams.get('code');

    if (steamStatus === 'connected') {
      setBanner({ tone: 'success', message: 'Steam account connected.' });
      void refresh();
    } else if (steamStatus === 'error') {
      if (errorCode === 'STEAM_API_KEY_MISSING') {
        setBanner({ tone: 'error', message: 'Set your Steam API key before connecting.' });
      } else {
        setBanner({ tone: 'error', message: 'Steam login failed. Try again.' });
      }
    }

    if (steamStatus) {
      const next = new URLSearchParams(searchParams);
      next.delete('steam');
      next.delete('code');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, refresh]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const body = await apiPut<PublicSettings>('/api/admin/settings', {
        steam: { apiKey: apiKey.trim() },
      });
      setSettings(body);
      setApiKey('');
      setBanner({ tone: 'success', message: 'Steam API key saved.' });
      await refresh();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveSteamId() {
    if (!steamId64.trim()) return;
    setSaving(true);
    try {
      const body = await apiPut<PublicSettings>('/api/admin/settings', {
        steam: { id64: steamId64.trim() },
      });
      setSettings(body);
      setSteamId64('');
      setBanner({ tone: 'success', message: 'Steam ID saved.' });
      await refresh();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to save Steam ID.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function startSync() {
    setSyncing(true);
    try {
      await apiPost('/api/admin/sync');
      setBanner({ tone: 'success', message: 'Library sync started.' });
      const status = await apiGet<SyncStatus>('/api/admin/sync/status');
      setSyncStatus(status);
      await refresh();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  }

  if (loading || !settings || !setupStatus) {
    return (
      <section>
        <h1 className="mb-2 text-2xl font-semibold">Setup</h1>
        <p className="text-neutral-500">Loading…</p>
      </section>
    );
  }

  const connectDisabled = !settings.steam.apiKeyConfigured && apiKey.trim().length === 0;

  return (
    <section className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Setup</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Configure Steam, sync your library, then head to Library.
        </p>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      {setupStatus.complete ? (
        <Banner
          tone="success"
          message="Setup complete. Your shelf is ready."
        />
      ) : null}

      <ol className="space-y-6">
        <li className="rounded border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">1. Steam API key</h2>
            {setupStatus.steps.apiKey.done ? (
              <span className="text-xs text-green-700">Done</span>
            ) : null}
          </div>
          <label className="block space-y-1 text-sm">
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.steam.apiKeyConfigured ? 'Configured — enter to replace' : ''}
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <Button className="mt-3" onClick={() => void saveApiKey()} disabled={saving || !apiKey.trim()}>
            {saving ? 'Saving…' : 'Save API key'}
          </Button>
        </li>

        <li className="rounded border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">2. Connect Steam</h2>
            {setupStatus.steps.steamConnected.done ? (
              <span className="text-xs text-green-700">Done</span>
            ) : null}
          </div>
          {settings.steam.openIdEnabled ? (
            <div className="space-y-3">
              <p className="text-sm">
                Account:{' '}
                {settings.steam.connected
                  ? `Connected (${truncateSteamId(settings.steam.id64)})`
                  : 'Not connected'}
              </p>
              <Button
                disabled={connectDisabled}
                onClick={() => {
                  window.location.href = '/api/admin/steam/login';
                }}
              >
                Connect Steam
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                OpenID disabled. Enter your SteamID64 manually.
              </p>
              <input
                type="text"
                value={steamId64}
                onChange={(e) => setSteamId64(e.target.value)}
                placeholder={settings.steam.connected ? truncateSteamId(settings.steam.id64) : '7656119…'}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <Button onClick={() => void saveSteamId()} disabled={saving || !steamId64.trim()}>
                Save Steam ID
              </Button>
            </div>
          )}
        </li>

        <li className="rounded border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">3. Sync library</h2>
            {setupStatus.steps.librarySynced.done ? (
              <span className="text-xs text-green-700">Done</span>
            ) : null}
          </div>
          <p className="mb-3 text-sm text-neutral-600">
            Games: {syncStatus?.library.totalGames ?? 0}
            {syncStatus?.library.lastSyncAt
              ? ` · Last sync ${new Date(syncStatus.library.lastSyncAt).toLocaleString()}`
              : ''}
          </p>
          <Button onClick={() => void startSync()} disabled={syncing || syncStatus?.isSyncing}>
            {syncing || syncStatus?.isSyncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </li>

        <li className="rounded border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-medium">4. Server URL</h2>
          <p className="text-sm text-neutral-600">
            <code className="rounded bg-neutral-100 px-1">{settings.server.publicUrl}</code>
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Set <code>SERVER_PUBLIC_URL</code> in your <code>.env</code> if this is wrong.
          </p>
        </li>
      </ol>

      {setupStatus.complete ? (
        <Link to="/library" className="inline-block text-sm font-medium text-neutral-900 underline">
          Go to Library →
        </Link>
      ) : null}
    </section>
  );
}
