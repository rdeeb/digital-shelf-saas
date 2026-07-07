import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, apiPost } from '../api/client';
import type { AccountLoginResponse } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

export const STEAM_LOGIN_PATH = '/api/auth/steam/login';

export function getLoginErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === 'STEAM_OPENID_FAILED') return 'Steam sign-in failed. Please try again.';
  if (error === 'ACCOUNT_COMPLETION_REQUIRED')
    return 'Finish linking your Steam account to continue.';
  return 'Sign-in failed. Please try again.';
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(getLoginErrorMessage(searchParams.get('error')));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiPost<AccountLoginResponse>('/api/auth/account/login', {
        email,
        password,
      });
      window.location.assign('/library');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ACCOUNT_COMPLETION_REQUIRED') {
        const body = error.body as { completionToken?: string } | null;
        setMessage('Finish linking your Steam account to continue.');
        if (body?.completionToken) {
          window.location.assign(
            `${STEAM_LOGIN_PATH}?purpose=account_activation&token=${encodeURIComponent(body.completionToken)}`,
          );
        }
        return;
      }
      setMessage('Sign-in failed. Please try again.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <section className="w-full max-w-sm rounded border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sign in with your email and password. Steam linking happens next if your account is not
          finished yet.
        </p>
        {message ? (
          <div className="mt-4">
            <Banner tone="error" message={message} />
          </div>
        ) : null}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-700">Email</span>
            <input
              className="w-full rounded border border-neutral-300 px-3 py-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-700">Password</span>
            <input
              className="w-full rounded border border-neutral-300 px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button className="w-full" type="submit">
            Sign in
          </Button>
        </form>
      </section>
    </main>
  );
}
