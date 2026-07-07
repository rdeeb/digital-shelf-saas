import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, type DeviceConfig, type SelectionMode } from './index.js';

describe('@digital-shelf-saas/core', () => {
  it('re-exports shared types without Prisma', () => {
    expect(PACKAGE_NAME).toBe('@digital-shelf-saas/core');

    const mode: SelectionMode = 'random';
    const config: DeviceConfig = {
      deviceId: 'dev_test',
      gamesPerFrame: 3,
      rotationIntervalSeconds: 300,
      selectionMode: mode,
      showPublisher: true,
      showPlaytime: false,
      avoidRecentRepeats: true,
      updatedAt: new Date(),
    };

    expect(config.selectionMode).toBe('random');
  });
});
