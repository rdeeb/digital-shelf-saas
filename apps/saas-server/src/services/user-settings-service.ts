import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_USER_DISPLAY_SETTINGS,
  USER_SETTING_KEYS,
  type UserSettingKey,
  selectionModeSchema,
  type SelectionMode,
} from '@digital-shelf-saas/shared-types';

export interface UserSettingsEnv {
  DEFAULT_DISPLAY_SHOW_PUBLISHER?: string;
  DEFAULT_DISPLAY_SHOW_PLAYTIME?: string;
  DEFAULT_DISPLAY_GAMES_PER_FRAME?: string;
  DEFAULT_DISPLAY_ROTATION_INTERVAL_SECONDS?: string;
  DEFAULT_DISPLAY_SELECTION_MODE?: string;
  DEFAULT_DISPLAY_AVOID_RECENT_REPEATS?: string;
  DEFAULT_NOTIFICATIONS_EMAIL_OPT_IN?: string;
}

export type UserDisplayDefaults = {
  showPublisher: boolean;
  showPlaytime: boolean;
  gamesPerFrame: number;
  rotationIntervalSeconds: number;
  selectionMode: SelectionMode;
  avoidRecentRepeats: boolean;
};

export type UserSettingsSnapshot = UserDisplayDefaults & {
  emailOptIn: boolean;
};

export type UpdateUserSettingsInput = {
  display?: Partial<UserDisplayDefaults>;
  notifications?: {
    emailOptIn?: boolean;
  };
};

const KEY_TO_ENV: Record<UserSettingKey, keyof UserSettingsEnv> = {
  [USER_SETTING_KEYS.DISPLAY_SHOW_PUBLISHER]: 'DEFAULT_DISPLAY_SHOW_PUBLISHER',
  [USER_SETTING_KEYS.DISPLAY_SHOW_PLAYTIME]: 'DEFAULT_DISPLAY_SHOW_PLAYTIME',
  [USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME]: 'DEFAULT_DISPLAY_GAMES_PER_FRAME',
  [USER_SETTING_KEYS.DISPLAY_ROTATION_INTERVAL_SECONDS]:
    'DEFAULT_DISPLAY_ROTATION_INTERVAL_SECONDS',
  [USER_SETTING_KEYS.DISPLAY_SELECTION_MODE]: 'DEFAULT_DISPLAY_SELECTION_MODE',
  [USER_SETTING_KEYS.DISPLAY_AVOID_RECENT_REPEATS]: 'DEFAULT_DISPLAY_AVOID_RECENT_REPEATS',
  [USER_SETTING_KEYS.NOTIFICATIONS_EMAIL_OPT_IN]: 'DEFAULT_NOTIFICATIONS_EMAIL_OPT_IN',
};

const HARDCODED_DEFAULTS: Record<UserSettingKey, string> = {
  [USER_SETTING_KEYS.DISPLAY_SHOW_PUBLISHER]: String(DEFAULT_USER_DISPLAY_SETTINGS.showPublisher),
  [USER_SETTING_KEYS.DISPLAY_SHOW_PLAYTIME]: String(DEFAULT_USER_DISPLAY_SETTINGS.showPlaytime),
  [USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME]: String(DEFAULT_USER_DISPLAY_SETTINGS.gamesPerFrame),
  [USER_SETTING_KEYS.DISPLAY_ROTATION_INTERVAL_SECONDS]: String(
    DEFAULT_USER_DISPLAY_SETTINGS.rotationIntervalSeconds,
  ),
  [USER_SETTING_KEYS.DISPLAY_SELECTION_MODE]: DEFAULT_USER_DISPLAY_SETTINGS.selectionMode,
  [USER_SETTING_KEYS.DISPLAY_AVOID_RECENT_REPEATS]: String(
    DEFAULT_USER_DISPLAY_SETTINGS.avoidRecentRepeats,
  ),
  [USER_SETTING_KEYS.NOTIFICATIONS_EMAIL_OPT_IN]: 'false',
};

function parseBoolean(value: string): boolean {
  return value !== 'false';
}

function parseDisplayDefaults(values: Record<UserSettingKey, string>): UserDisplayDefaults {
  return {
    showPublisher: parseBoolean(values[USER_SETTING_KEYS.DISPLAY_SHOW_PUBLISHER]),
    showPlaytime: parseBoolean(values[USER_SETTING_KEYS.DISPLAY_SHOW_PLAYTIME]),
    gamesPerFrame: Number.parseInt(values[USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME], 10),
    rotationIntervalSeconds: Number.parseInt(
      values[USER_SETTING_KEYS.DISPLAY_ROTATION_INTERVAL_SECONDS],
      10,
    ),
    selectionMode: selectionModeSchema.parse(values[USER_SETTING_KEYS.DISPLAY_SELECTION_MODE]),
    avoidRecentRepeats: parseBoolean(values[USER_SETTING_KEYS.DISPLAY_AVOID_RECENT_REPEATS]),
  };
}

export function createUserSettingsService(prisma: PrismaClient, env: UserSettingsEnv) {
  async function resolveSetting(userId: string, key: UserSettingKey): Promise<string> {
    const row = await prisma.userSetting.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (row?.value) {
      return row.value;
    }

    const envKey = KEY_TO_ENV[key];
    const envValue = env[envKey];
    if (envValue) {
      return envValue;
    }

    return HARDCODED_DEFAULTS[key];
  }

  async function setSetting(userId: string, key: UserSettingKey, value: string): Promise<void> {
    await prisma.userSetting.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
    });
  }

  async function resolveDisplayDefaults(userId: string): Promise<UserDisplayDefaults> {
    const keys = Object.values(USER_SETTING_KEYS).filter(
      (key) => key !== USER_SETTING_KEYS.NOTIFICATIONS_EMAIL_OPT_IN,
    );
    const entries = await Promise.all(
      keys.map(async (key) => [key, await resolveSetting(userId, key)] as const),
    );
    return parseDisplayDefaults(Object.fromEntries(entries) as Record<UserSettingKey, string>);
  }

  async function getSettings(userId: string): Promise<UserSettingsSnapshot> {
    const display = await resolveDisplayDefaults(userId);
    const emailOptIn = parseBoolean(
      await resolveSetting(userId, USER_SETTING_KEYS.NOTIFICATIONS_EMAIL_OPT_IN),
    );
    return { ...display, emailOptIn };
  }

  async function updateSettings(
    userId: string,
    input: UpdateUserSettingsInput,
  ): Promise<UserSettingsSnapshot> {
    if (input.display?.showPublisher !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_SHOW_PUBLISHER,
        String(input.display.showPublisher),
      );
    }
    if (input.display?.showPlaytime !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_SHOW_PLAYTIME,
        String(input.display.showPlaytime),
      );
    }
    if (input.display?.gamesPerFrame !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME,
        String(input.display.gamesPerFrame),
      );
    }
    if (input.display?.rotationIntervalSeconds !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_ROTATION_INTERVAL_SECONDS,
        String(input.display.rotationIntervalSeconds),
      );
    }
    if (input.display?.selectionMode !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_SELECTION_MODE,
        input.display.selectionMode,
      );
    }
    if (input.display?.avoidRecentRepeats !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.DISPLAY_AVOID_RECENT_REPEATS,
        String(input.display.avoidRecentRepeats),
      );
    }
    if (input.notifications?.emailOptIn !== undefined) {
      await setSetting(
        userId,
        USER_SETTING_KEYS.NOTIFICATIONS_EMAIL_OPT_IN,
        String(input.notifications.emailOptIn),
      );
    }

    return getSettings(userId);
  }

  return {
    resolveSetting,
    setSetting,
    resolveDisplayDefaults,
    getSettings,
    updateSettings,
  };
}

export type UserSettingsService = ReturnType<typeof createUserSettingsService>;
