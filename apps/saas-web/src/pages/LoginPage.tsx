import { useSearchParams } from 'react-router-dom';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

export const STEAM_LOGIN_PATH = '/api/auth/steam/login';

export function getLoginErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === 'STEAM_OPENID_FAILED') return 'Steam sign-in failed. Please try again.';
  return 'Sign-in failed. Please try again.';
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const errorMessage = getLoginErrorMessage(searchParams.get('error'));

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <section className="w-full max-w-sm rounded border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Use your Steam account to manage your digital shelf.
        </p>
        {errorMessage ? (
          <div className="mt-4">
            <Banner tone="error" message={errorMessage} />
          </div>
        ) : null}
        <Button
          className="mt-6 w-full"
          onClick={() => {
            window.location.href = STEAM_LOGIN_PATH;
          }}
        >
          Sign in with Steam
        </Button>
      </section>
    </main>
  );
}
