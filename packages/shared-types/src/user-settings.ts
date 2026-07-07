export const USER_SETTING_KEYS = {
  DISPLAY_SHOW_PUBLISHER: 'display.show_publisher',
  DISPLAY_SHOW_PLAYTIME: 'display.show_playtime',
  DISPLAY_GAMES_PER_FRAME: 'display.games_per_frame',
  DISPLAY_ROTATION_INTERVAL_SECONDS: 'display.rotation_interval_seconds',
  DISPLAY_SELECTION_MODE: 'display.selection_mode',
  DISPLAY_AVOID_RECENT_REPEATS: 'display.avoid_recent_repeats',
  NOTIFICATIONS_EMAIL_OPT_IN: 'notifications.email_opt_in',
} as const;

export type UserSettingKey = (typeof USER_SETTING_KEYS)[keyof typeof USER_SETTING_KEYS];
