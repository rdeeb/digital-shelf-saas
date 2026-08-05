import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { USER_SETTING_KEYS } from '@digital-shelf-saas/shared-types';
import { createUserSettingsService } from './user-settings-service.js';
import { createTestUser } from '../test-support/user-fixtures.js';

describe('user-settings-service', () => {
  const prisma = new PrismaClient();
  const settings = createUserSettingsService(prisma, {});

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolveDisplayDefaults returns hardcoded defaults', async () => {
    const user = await createTestUser(prisma, { email: `${Date.now()}-010@test.local` });

    const defaults = await settings.resolveDisplayDefaults(user.id);
    expect(defaults).toEqual({
      showPublisher: true,
      showPlaytime: false,
      gamesPerFrame: 3,
      rotationIntervalSeconds: 300,
      selectionMode: 'random',
      avoidRecentRepeats: true,
    });

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('resolveDisplayDefaults returns stored value after setSetting', async () => {
    const user = await createTestUser(prisma, { email: `${Date.now()}-011@test.local` });

    await settings.setSetting(user.id, USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME, '5');
    const defaults = await settings.resolveDisplayDefaults(user.id);
    expect(defaults.gamesPerFrame).toBe(5);

    await prisma.userSetting.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('prefers env default over hardcoded when DB empty', async () => {
    const envSettings = createUserSettingsService(prisma, {
      DEFAULT_DISPLAY_GAMES_PER_FRAME: '7',
    });
    const user = await createTestUser(prisma, { email: `${Date.now()}-012@test.local` });

    const defaults = await envSettings.resolveDisplayDefaults(user.id);
    expect(defaults.gamesPerFrame).toBe(7);

    await prisma.user.delete({ where: { id: user.id } });
  });
});
