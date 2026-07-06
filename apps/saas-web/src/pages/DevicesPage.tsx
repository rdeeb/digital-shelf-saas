import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import type { DeviceDetail, DeviceListItem, FrameSummary, DeviceConfig } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { FramePreview } from '../components/FramePreview';
import { StatusBadge } from '../components/StatusBadge';

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [frame, setFrame] = useState<FrameSummary | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimName, setClaimName] = useState('');
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDevices = useCallback(async () => {
    const data = await apiGet<{ devices: DeviceListItem[] }>('/api/admin/devices');
    setDevices(data.devices);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadDevices();
      } catch (err) {
        setBanner({
          tone: 'error',
          message: err instanceof Error ? err.message : 'Failed to load devices.',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadDevices]);

  async function loadDetail(deviceId: string) {
    const data = await apiGet<DeviceDetail>(`/api/admin/devices/${deviceId}`);
    setDetail(data);
  }

  async function loadFrame(deviceId: string, force = false) {
    setFrameLoading(true);
    setFrameError(null);
    try {
      const url = force
        ? `/api/admin/devices/${deviceId}/frame?force=true`
        : `/api/admin/devices/${deviceId}/frame`;
      const data = await apiGet<FrameSummary>(url);
      setFrame(data);
    } catch (err) {
      setFrame(null);
      setFrameError(err instanceof Error ? err.message : 'Frame preview failed.');
    } finally {
      setFrameLoading(false);
    }
  }

  async function toggleExpand(deviceId: string) {
    if (expandedId === deviceId) {
      setExpandedId(null);
      setDetail(null);
      setFrame(null);
      return;
    }
    setExpandedId(deviceId);
    try {
      await loadDetail(deviceId);
      await loadFrame(deviceId);
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Failed to load device.',
      });
    }
  }

  async function claimDevice() {
    if (!/^\d{6}$/.test(claimCode)) {
      setBanner({ tone: 'error', message: 'Enter a 6-digit claim code.' });
      return;
    }
    try {
      await apiPost('/api/admin/devices/claim', {
        claimCode,
        name: claimName.trim() || undefined,
      });
      setClaimCode('');
      setClaimName('');
      setBanner({ tone: 'success', message: 'Device claimed.' });
      await loadDevices();
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Claim failed.',
      });
    }
  }

  async function saveConfig() {
    if (!detail?.config || !expandedId) return;
    setSaving(true);
    try {
      const updated = await apiPatch<DeviceDetail>(`/api/admin/devices/${expandedId}`, {
        name: detail.name,
        config: {
          gamesPerFrame: detail.config.gamesPerFrame,
          rotationIntervalSeconds: detail.config.rotationIntervalSeconds,
          selectionMode: detail.config.selectionMode,
          showPublisher: detail.config.showPublisher,
          showPlaytime: detail.config.showPlaytime,
          avoidRecentRepeats: detail.config.avoidRecentRepeats,
        },
      });
      setDetail(updated);
      setBanner({ tone: 'success', message: 'Device config saved.' });
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteDevice(deviceId: string) {
    if (!window.confirm('Delete this device?')) return;
    try {
      await apiDelete(`/api/admin/devices/${deviceId}`);
      setExpandedId(null);
      setDetail(null);
      setFrame(null);
      setBanner({ tone: 'success', message: 'Device deleted.' });
      await loadDevices();
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Delete failed.',
      });
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading devices…</p>;
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="mt-1 text-sm text-neutral-600">Pair ESP32 displays and configure shelf behavior.</p>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <div className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Claim device</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={claimName}
            onChange={(e) => setClaimName(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button onClick={() => void claimDevice()}>Claim</Button>
        </div>
      </div>

      <div className="space-y-3">
        {devices.map((device) => (
          <div key={device.id} className="rounded border border-neutral-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
              onClick={() => void toggleExpand(device.id)}
            >
              <div>
                <span className="font-medium">
                  {device.name}
                  {device.isPreview ? ' (Server Preview)' : ''}
                </span>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                  <StatusBadge status={device.status} />
                  <span>
                    {device.screenWidth}×{device.screenHeight}
                  </span>
                  {device.lastSeenAt ? (
                    <span>Last seen {new Date(device.lastSeenAt).toLocaleString()}</span>
                  ) : (
                    <span>Never seen</span>
                  )}
                  {device.firmwareVersion ? <span>FW {device.firmwareVersion}</span> : null}
                </div>
              </div>
              <span className="text-neutral-400">{expandedId === device.id ? '▲' : '▼'}</span>
            </button>

            {expandedId === device.id && detail?.config ? (
              <div className="border-t border-neutral-100 px-4 py-4">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1">
                      <span>Name</span>
                      <input
                        type="text"
                        value={detail.name}
                        onChange={(e) => setDetail({ ...detail, name: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-3 py-2"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Games per frame</span>
                      <select
                        value={detail.config.gamesPerFrame}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: {
                              ...detail.config!,
                              gamesPerFrame: Number(e.target.value) as 1 | 2 | 3,
                            },
                          })
                        }
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
                        value={detail.config.rotationIntervalSeconds}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: {
                              ...detail.config!,
                              rotationIntervalSeconds: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Selection mode</span>
                      <select
                        value={detail.config.selectionMode}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: {
                              ...detail.config!,
                              selectionMode: e.target.value as DeviceConfig['selectionMode'],
                            },
                          })
                        }
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
                        checked={detail.config.showPublisher}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: { ...detail.config!, showPublisher: e.target.checked },
                          })
                        }
                      />
                      Show publisher
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={detail.config.showPlaytime}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: { ...detail.config!, showPlaytime: e.target.checked },
                          })
                        }
                      />
                      Show playtime
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={detail.config.avoidRecentRepeats}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            config: { ...detail.config!, avoidRecentRepeats: e.target.checked },
                          })
                        }
                      />
                      Avoid recent repeats
                    </label>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => void saveConfig()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save config'}
                      </Button>
                      {!device.isPreview ? (
                        <Button variant="danger" onClick={() => void deleteDevice(device.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Frame preview</h3>
                    <FramePreview
                      pngUrl={frame?.downloadUrls.png ?? null}
                      loading={frameLoading}
                      error={frameError}
                      regenerating={frameLoading}
                      onRegenerate={() => expandedId && void loadFrame(expandedId, true)}
                    />
                    {frame?.games.length ? (
                      <p className="mt-2 text-xs text-neutral-500">
                        {frame.games.map((g) => g.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
