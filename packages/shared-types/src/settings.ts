export const SETTING_KEYS = {
  STEAM_API_KEY: 'steam.api_key',
  STEAM_ID_64: 'steam.id_64',
  SERVER_PUBLIC_URL: 'server.public_url',
  DISPLAY_SPINE_STYLE: 'display.spine_style',
  DISPLAY_SHOW_TITLE: 'display.show_title',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const SETTING_ENV_FALLBACKS: Record<SettingKey, string> = {
  [SETTING_KEYS.STEAM_API_KEY]: 'STEAM_API_KEY',
  [SETTING_KEYS.STEAM_ID_64]: 'STEAM_ID_64',
  [SETTING_KEYS.SERVER_PUBLIC_URL]: 'SERVER_PUBLIC_URL',
  [SETTING_KEYS.DISPLAY_SPINE_STYLE]: '',
  [SETTING_KEYS.DISPLAY_SHOW_TITLE]: '',
};

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.STEAM_API_KEY]: '',
  [SETTING_KEYS.STEAM_ID_64]: '',
  [SETTING_KEYS.SERVER_PUBLIC_URL]: 'http://localhost:8080',
  [SETTING_KEYS.DISPLAY_SPINE_STYLE]: 'gradient',
  [SETTING_KEYS.DISPLAY_SHOW_TITLE]: 'false',
};

/**
 * Resolution order (implemented in a later spec):
 * DB settings value → env var → SETTING_DEFAULTS
 */
export type SettingResolutionSource = 'database' | 'environment' | 'default';
