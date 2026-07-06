import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { apiGet } from '../api/client';
import type { SetupStatus } from '../api/types';

export function SetupGate() {
  const location = useLocation();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<SetupStatus>('/api/admin/setup/status');
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Checking setup…</p>;
  }

  if (status && !status.complete && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return <Outlet />;
}
