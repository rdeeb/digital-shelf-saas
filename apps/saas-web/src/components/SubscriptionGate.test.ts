import { describe, expect, it } from 'vitest';
import {
  getSalesStopMessage,
  resolveProtectedAccess,
  resolveProtectedRedirect,
} from './SubscriptionGate';

describe('subscription gate helpers', () => {
  it('redirects unauthenticated users to login', () => {
    expect(
      resolveProtectedRedirect({
        authenticated: false,
        hasActiveSubscription: false,
        pathname: '/library',
      }),
    ).toBe('/login');
  });

  it('redirects authenticated users without active subscription to subscribe', () => {
    expect(
      resolveProtectedRedirect({
        authenticated: true,
        hasActiveSubscription: false,
        pathname: '/devices',
      }),
    ).toBe('/subscribe');
  });

  it('allows subscribe route when subscription is inactive', () => {
    expect(
      resolveProtectedRedirect({
        authenticated: true,
        hasActiveSubscription: false,
        pathname: '/subscribe',
      }),
    ).toBeNull();
  });

  it('allows subscribe callback routes when subscription is inactive', () => {
    expect(
      resolveProtectedAccess({
        authenticated: true,
        subscriptionAccess: 'inactive',
        activationState: 'active',
        pathname: '/subscribe/success',
      }),
    ).toEqual({ kind: 'allow' });
  });

  it('allows app routes with active subscription', () => {
    expect(
      resolveProtectedRedirect({
        authenticated: true,
        hasActiveSubscription: true,
        pathname: '/library',
      }),
    ).toBeNull();
  });

  it('does not redirect while billing status is still loading', () => {
    expect(
      resolveProtectedAccess({
        authenticated: true,
        subscriptionAccess: 'loading',
        activationState: 'active',
        pathname: '/library',
      }),
    ).toEqual({ kind: 'loading' });
  });

  it('shows an error when billing status fails instead of redirecting to subscribe', () => {
    expect(
      resolveProtectedAccess({
        authenticated: true,
        subscriptionAccess: 'error',
        activationState: 'active',
        pathname: '/library',
      }),
    ).toEqual({ kind: 'error' });
  });

  it('redirects incomplete authenticated users back to login', () => {
    expect(
      resolveProtectedAccess({
        authenticated: true,
        subscriptionAccess: 'inactive',
        activationState: 'pending_activation',
        pathname: '/library',
      }),
    ).toEqual({ kind: 'redirect', to: '/login' });
  });

  it('returns stop message only when new sales are disabled', () => {
    expect(
      getSalesStopMessage({
        newEnabled: false,
        renewalsEnabled: true,
        stopMessage: 'New subscriptions are paused.',
      }),
    ).toBe('New subscriptions are paused.');

    expect(
      getSalesStopMessage({
        newEnabled: true,
        renewalsEnabled: true,
        stopMessage: 'Ignored.',
      }),
    ).toBeNull();
  });
});
