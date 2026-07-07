import { describe, expect, it } from 'vitest';
import { resolveAppRedirect } from './App';

describe('app redirects', () => {
  it('maps subscribe callbacks back to subscribe with status messages', () => {
    expect(resolveAppRedirect('/subscribe/success')).toBe('/subscribe?status=success');
    expect(resolveAppRedirect('/subscribe/cancel')).toBe('/subscribe?status=cancel');
  });

  it('maps backend onboarding redirects to existing app pages', () => {
    expect(resolveAppRedirect('/onboarding/sync')).toBe('/library');
    expect(resolveAppRedirect('/dashboard')).toBe('/library');
  });
});
