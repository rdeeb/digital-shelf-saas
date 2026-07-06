import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { apiGet } from '../api/client';
import type {
  AuthMeResponse,
  BillingPlansResponse,
  BillingSalesFlags,
  BillingStatusResponse,
} from '../api/types';
import { Banner } from './Banner';
import { Button } from './Button';

type ProtectedRedirectInput = {
  authenticated: boolean;
  hasActiveSubscription: boolean;
  pathname: string;
};

type SubscriptionAccess = 'loading' | 'active' | 'inactive' | 'error';

type ProtectedAccessInput = {
  authenticated: boolean;
  subscriptionAccess: SubscriptionAccess;
  pathname: string;
};

type ProtectedAccessResult =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'redirect'; to: '/login' | '/subscribe' }
  | { kind: 'allow' };

type SubscriptionGateContextValue = {
  salesStopMessage: string | null;
};

const SubscriptionGateContext = createContext<SubscriptionGateContextValue>({
  salesStopMessage: null,
});

function isSubscribePath(pathname: string): boolean {
  return pathname === '/subscribe' || pathname.startsWith('/subscribe/');
}

export function resolveProtectedRedirect({
  authenticated,
  hasActiveSubscription,
  pathname,
}: ProtectedRedirectInput): '/login' | '/subscribe' | null {
  if (!authenticated) return '/login';
  if (!hasActiveSubscription && !isSubscribePath(pathname)) return '/subscribe';
  return null;
}

export function resolveProtectedAccess({
  authenticated,
  subscriptionAccess,
  pathname,
}: ProtectedAccessInput): ProtectedAccessResult {
  if (!authenticated) return { kind: 'redirect', to: '/login' };
  if (subscriptionAccess === 'loading') return { kind: 'loading' };
  if (subscriptionAccess === 'error') return { kind: 'error' };
  if (subscriptionAccess === 'inactive' && !isSubscribePath(pathname)) {
    return { kind: 'redirect', to: '/subscribe' };
  }
  return { kind: 'allow' };
}

export function getSalesStopMessage(salesFlags: BillingSalesFlags | null | undefined): string | null {
  if (!salesFlags || salesFlags.newEnabled) return null;
  return salesFlags.stopMessage || 'New subscriptions are currently paused.';
}

export function isActiveSubscription(status: BillingStatusResponse | null): boolean {
  return status?.subscription?.status === 'active';
}

export function useSubscriptionGate() {
  return useContext(SubscriptionGateContext);
}

export function SubscriptionGate() {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccess>('loading');
  const [salesFlags, setSalesFlags] = useState<BillingSalesFlags | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setAuthenticated(null);
      setSubscriptionAccess('loading');
      setSalesFlags(null);

      try {
        await apiGet<AuthMeResponse>('/auth/me');
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setSubscriptionAccess('inactive');
        }
        return;
      }

      if (cancelled) return;
      setAuthenticated(true);

      void apiGet<BillingPlansResponse>('/billing/plans')
        .then((plans) => {
          if (!cancelled) setSalesFlags(plans.salesFlags);
        })
        .catch(() => {
          if (!cancelled) setSalesFlags(null);
        });

      try {
        const status = await apiGet<BillingStatusResponse>('/billing/status');
        if (!cancelled) {
          setSubscriptionAccess(isActiveSubscription(status) ? 'active' : 'inactive');
        }
      } catch {
        if (!cancelled) setSubscriptionAccess('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const contextValue = useMemo(
    () => ({ salesStopMessage: getSalesStopMessage(salesFlags) }),
    [salesFlags],
  );

  if (authenticated === null) {
    return <p className="p-8 text-sm text-neutral-500">Checking account...</p>;
  }

  const access = resolveProtectedAccess({
    authenticated,
    subscriptionAccess,
    pathname: location.pathname,
  });

  if (access.kind === 'loading') {
    return <p className="p-8 text-sm text-neutral-500">Checking subscription...</p>;
  }

  if (access.kind === 'error') {
    return (
      <main className="max-w-xl p-8">
        <Banner tone="error" message="Unable to verify subscription status. Please try again." />
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </main>
    );
  }

  if (access.kind === 'redirect') {
    return <Navigate to={access.to} replace state={{ from: location.pathname }} />;
  }

  return (
    <SubscriptionGateContext.Provider value={contextValue}>
      <Outlet />
    </SubscriptionGateContext.Provider>
  );
}
