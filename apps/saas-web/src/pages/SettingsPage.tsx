import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../api/client';
import type { UserSettingsResponse } from '../api/types';
import { Banner } from '../components/Banner';

type DisplaySettingsPatch = Partial<UserSettingsResponse['display']>;

export function getSettingsPath(): string {
  return '/settings';
}

export function buildSettingsPatch(display: DisplaySettingsPatch): {
  display: DisplaySettingsPatch;
} {
  return { display };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const settingsData = await apiGet<UserSettingsResponse>(getSettingsPath());
    setSettings(settingsData);
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

  async function saveDisplay(patch: DisplaySettingsPatch) {
    if (!settings) return;
    setBusy(true);
    try {
      const body = await apiPatch<UserSettingsResponse>(getSettingsPath(), buildSettingsPatch(patch));
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

  if (loading || !settings) {
    return <p className="text-sm text-neutral-500">Loading settings...</p>;
  }

  return (
    <section className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">Default display behavior for your shelves.</p>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <div className="space-y-3 rounded border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Display defaults</h2>
        <label className="block space-y-1">
          <span>Games per frame</span>
          <select
            value={settings.display.gamesPerFrame}
            onChange={(e) =>
              void saveDisplay({ gamesPerFrame: Number(e.target.value) as 1 | 2 | 3 })
            }
            disabled={busy}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span>Rotation interval (seconds)</span>
          <input
            type="number"
            min={60}
            value={settings.display.rotationIntervalSeconds}
            onChange={(e) => void saveDisplay({ rotationIntervalSeconds: Number(e.target.value) })}
            disabled={busy}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span>Selection mode</span>
          <select
            value={settings.display.selectionMode}
            onChange={(e) =>
              void saveDisplay({
                selectionMode: e.target.value as UserSettingsResponse['display']['selectionMode'],
              })
            }
            disabled={busy}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          >
            <option value="random">Random</option>
            <option value="backlog">Backlog</option>
            <option value="favorites">Favorites</option>
            <option value="most_played">Most played</option>
            <option value="never_played">Never played</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.display.showPublisher}
            onChange={(e) => void saveDisplay({ showPublisher: e.target.checked })}
            disabled={busy}
          />
          Show publisher
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.display.showPlaytime}
            onChange={(e) => void saveDisplay({ showPlaytime: e.target.checked })}
            disabled={busy}
          />
          Show playtime
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.display.avoidRecentRepeats}
            onChange={(e) => void saveDisplay({ avoidRecentRepeats: e.target.checked })}
            disabled={busy}
          />
          Avoid recent repeats
        </label>
      </div>
    </section>
  );
}
