import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildLibraryGamePath,
  buildLibraryPath,
  getLibrarySyncPath,
  shouldShowNoSyncedGames,
} from './LibraryPage';
import {
  buildDeviceConfigPath,
  buildDeviceFramePath,
  buildDevicePath,
  buildDeviceClaimPayload,
  getBillingStatusPath,
  getDevicesPath,
} from './DevicesPage';
import { getSettingsPath, buildSettingsPatch } from './SettingsPage';

const pageDir = dirname(fileURLToPath(import.meta.url));

function pageSource(fileName: string): string {
  return readFileSync(resolve(pageDir, fileName), 'utf8');
}

describe('SaaS page endpoints', () => {
  it('uses relative v1 library endpoints', () => {
    expect(buildLibraryPath(new URLSearchParams('page=1'))).toBe('/library?page=1');
    expect(getLibrarySyncPath()).toBe('/library/sync');
    expect(buildLibraryGamePath('ug_1')).toBe('/library/games/ug_1');
  });

  it('keeps filtered empty results in the table state', () => {
    expect(
      shouldShowNoSyncedGames({
        loading: false,
        total: 0,
        search: '',
        favoriteFilter: 'all',
        hiddenFilter: 'all',
        publisherFilter: 'all',
      }),
    ).toBe(true);
    expect(
      shouldShowNoSyncedGames({
        loading: false,
        total: 0,
        search: 'portal',
        favoriteFilter: 'all',
        hiddenFilter: 'all',
        publisherFilter: 'all',
      }),
    ).toBe(false);
    expect(
      shouldShowNoSyncedGames({
        loading: false,
        total: 0,
        search: '',
        favoriteFilter: 'true',
        hiddenFilter: 'all',
        publisherFilter: 'all',
      }),
    ).toBe(false);
  });

  it('uses relative v1 device endpoints and claim schema payload', () => {
    expect(getDevicesPath()).toBe('/devices');
    expect(getBillingStatusPath()).toBe('/billing/status');
    expect(buildDevicePath('device_1')).toBe('/devices/device_1');
    expect(buildDeviceConfigPath('device_1')).toBe('/devices/device_1/config');
    expect(buildDeviceFramePath('device_1')).toBe('/devices/device_1/frame');
    expect(buildDeviceFramePath('device_1', true)).toBe('/devices/device_1/frame?force=true');
    expect(buildDeviceClaimPayload('device_1', '483921', '')).toEqual({
      deviceId: 'device_1',
      claimCode: '483921',
    });
    expect(buildDeviceClaimPayload('device_1', '483921', 'Kitchen')).toEqual({
      deviceId: 'device_1',
      claimCode: '483921',
      name: 'Kitchen',
    });
  });

  it('uses relative v1 settings endpoints and patch shape', () => {
    expect(getSettingsPath()).toBe('/settings');
    expect(buildSettingsPatch({ showPublisher: true })).toEqual({
      display: { showPublisher: true },
    });
  });

  it('removes admin and Steam API key UI from task pages', () => {
    for (const fileName of ['LibraryPage.tsx', 'DevicesPage.tsx', 'SettingsPage.tsx']) {
      const source = pageSource(fileName);
      expect(source).not.toContain('/api/admin');
      expect(source).not.toMatch(/Steam API key|apiKeyConfigured/);
    }
  });
});
