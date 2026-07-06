import { describe, expect, it } from 'vitest';
import { getLoginErrorMessage } from './LoginPage';

describe('LoginPage helpers', () => {
  it('shows a Steam-specific message for Steam OpenID failures', () => {
    expect(getLoginErrorMessage('STEAM_OPENID_FAILED')).toBe(
      'Steam sign-in failed. Please try again.',
    );
  });

  it('shows a generic sign-in failure for unknown auth errors', () => {
    expect(getLoginErrorMessage('UNEXPECTED')).toBe('Sign-in failed. Please try again.');
  });

  it('does not show an error without an error query value', () => {
    expect(getLoginErrorMessage(null)).toBeNull();
  });
});
