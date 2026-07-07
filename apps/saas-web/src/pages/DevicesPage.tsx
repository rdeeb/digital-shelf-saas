import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../api/client';
import type {
  BillingStatusResponse,
  DeviceConfig,
  DeviceDetail,
  DeviceListItem,
  FrameSummary,
} from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { FramePreview } from '../components/FramePreview';
import { StatusBadge } from '../components/StatusBadge';

type ClaimPayload = {
  deviceId: string;
  claimCode: string;
  name?: string;
};

export function getDevicesPath(): string {
  return '/devices';
}

export function getBillingStatusPath(): string {
  return '/billing/status';
}

export function buildDevicePath(deviceId: string): string {
  return `/devices/${deviceId}`;
}

export function buildDeviceConfigPath(deviceId: string): string {
  return `/devices/${deviceId}/config`;
}

export function buildDeviceFramePath(deviceId: string, force = false): string {
  return force ? `/devices/${deviceId}/frame?force=true` : `/devices/${deviceId}/frame`;
}

export function buildDeviceClaimPayload(
  deviceId: string,
  claimCode: string,
  name: string,
): ClaimPayload {
  const trimmedName = name.trim();
  const payload = { deviceId: deviceId.trim(), claimCode: claimCode.trim() };
  return trimmedName ? { ...payload, name: trimmedName } : payload;
}

function formatDeviceLimit(limit: number | null): string {
  return limit === null ? 'Unlimited devices' : `${limit} device${limit === 1 ? '' : 's'}`;
}

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [frame, setFrame] = useState<FrameSummary | null>(null);
  const [claimDeviceId, setClaimDeviceId] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [claimName, setClaimName] = useState('');
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDevices = useCallback(async () => {
    const [devicesData, billingData] = await Promise.all([
      apiGet<{ devices: DeviceListItem[] }>(getDevicesPath()),
      apiGet<BillingStatusResponse>(getBillingStatusPath()),
    ]);
    setDevices(devicesData.devices);
    setBillingStatus(billingData);
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
    const data = await apiGet<DeviceDetail>(buildDevicePath(deviceId));
    setDetail(data);
  }

  async function loadFrame(deviceId: string, force = false) {
    setFrameLoading(true);
    setFrameError(null);
    try {
      const data = await apiGet<FrameSummary>(buildDeviceFramePath(deviceId, force));
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
    if (!claimDeviceId.trim()) {
      setBanner({ tone: 'error', message: 'Enter a device ID.' });
      return;
    }
    if (!/^\d{6}$/.test(claimCode.trim())) {
      setBanner({ tone: 'error', message: 'Enter a 6-digit claim code.' });
      return;
    }
    try {
      await apiPost('/devices/claim', buildDeviceClaimPayload(claimDeviceId, claimCode, claimName));
      setClaimDeviceId('');
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
      const updated = await apiPatch<DeviceDetail>(buildDeviceConfigPath(expandedId), {
        gamesPerFrame: detail.config.gamesPerFrame,
        rotationIntervalSeconds: detail.config.rotationIntervalSeconds,
        selectionMode: detail.config.selectionMode,
        showPublisher: detail.config.showPublisher,
        showPlaytime: detail.config.showPlaytime,
        avoidRecentRepeats: detail.config.avoidRecentRepeats,
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

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading devices...</p>;
  }

  const canClaim = billingStatus?.canClaimDevice ?? false;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {billingStatus
            ? `${devices.length} paired - ${formatDeviceLimit(billingStatus.deviceLimit)}`
            : `${devices.length} paired`}
        </p>
      </div>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <div className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Claim device</h2>
        {!canClaim ? (
          <p className="mb-3 text-sm text-neutral-600">Current plan device limit reached.</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Device ID"
            value={claimDeviceId}
            onChange={(e) => setClaimDeviceId(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
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
          <Button onClick={() => void claimDevice()} disabled={!canClaim}>
            Claim
          </Button>
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
                <span className="font-medium">{device.name}</span>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                  <StatusBadge status={device.status} />
                  <span>
                    {device.screenWidth}x{device.screenHeight}
                  </span>
                  {device.lastSeenAt ? (
                    <span>Last seen {new Date(device.lastSeenAt).toLocaleString()}</span>
                  ) : (
                    <span>Never seen</span>
                  )}
                  {device.firmwareVersion ? <span>FW {device.firmwareVersion}</span> : null}
                </div>
              </div>
              <span className="text-neutral-400">{expandedId === device.id ? 'Up' : 'Down'}</span>
            </button>

            {expandedId === device.id && detail?.config ? (
              <div className="border-t border-neutral-100 px-4 py-4">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 text-sm">
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
                        {saving ? 'Saving...' : 'Save config'}
                      </Button>
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
