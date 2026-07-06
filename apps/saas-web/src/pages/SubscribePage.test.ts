import { describe, expect, it } from 'vitest';
import { buildPaypalSubscribePayload, getSubscribeStatusMessage } from './SubscribePage';

describe('SubscribePage helpers', () => {
  it('builds PayPal subscribe payload with selected plan and billing cycle', () => {
    expect(buildPaypalSubscribePayload('plan_pro', 'annual')).toEqual({
      planId: 'plan_pro',
      billingCycle: 'annual',
    });
  });

  it('maps subscribe callback statuses to user messages', () => {
    expect(getSubscribeStatusMessage('success')).toBe(
      'PayPal approved your subscription. Refreshing account status may take a moment.',
    );
    expect(getSubscribeStatusMessage('cancel')).toBe('PayPal checkout was cancelled.');
    expect(getSubscribeStatusMessage(null)).toBeNull();
  });
});
