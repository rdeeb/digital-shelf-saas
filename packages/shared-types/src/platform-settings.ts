export const PLATFORM_SETTING_KEYS = {
  SALES_NEW_ENABLED: 'sales.new_enabled',
  SALES_RENEWALS_ENABLED: 'sales.renewals_enabled',
  SALES_STOP_MESSAGE: 'sales.stop_message',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];
