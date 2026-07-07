import { describe, expect, it } from 'vitest';
import {
  subscriptionStatusSchema,
  billingProviderSchema,
  USER_SETTING_KEYS,
  PLATFORM_SETTING_KEYS,
  createId,
} from './index.js';

describe('saas types', () => {
  it('validates subscription status', () => {
    expect(subscriptionStatusSchema.parse('active')).toBe('active');
    expect(() => subscriptionStatusSchema.parse('bogus')).toThrow();
  });

  it('creates user-prefixed ids', () => {
    expect(createId('user')).toMatch(/^user_/);
    expect(createId('sub')).toMatch(/^sub_/);
  });

  it('exports setting keys', () => {
    expect(USER_SETTING_KEYS.DISPLAY_SELECTION_MODE).toBe('display.selection_mode');
    expect(PLATFORM_SETTING_KEYS.SALES_NEW_ENABLED).toBe('sales.new_enabled');
  });

  it('validates billing provider', () => {
    expect(billingProviderSchema.parse('paypal')).toBe('paypal');
  });
});
