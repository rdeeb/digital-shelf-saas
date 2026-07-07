import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SubscriptionGate } from './components/SubscriptionGate';
import { AppLayout } from './layouts/AppLayout';
import { DevicesPage } from './pages/DevicesPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubscribePage } from './pages/SubscribePage';

export function resolveAppRedirect(pathname: string): string | null {
  if (pathname === '/subscribe/success') return '/subscribe?status=success';
  if (pathname === '/subscribe/cancel') return '/subscribe?status=cancel';
  if (pathname === '/onboarding/sync') return '/library';
  if (pathname === '/dashboard') return '/library';
  return null;
}

function KnownRedirectRoute() {
  const location = useLocation();
  return <Navigate to={resolveAppRedirect(location.pathname) ?? '/library'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SubscriptionGate />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/subscribe/success" element={<KnownRedirectRoute />} />
          <Route path="/subscribe/cancel" element={<KnownRedirectRoute />} />
          <Route path="/onboarding/sync" element={<KnownRedirectRoute />} />
          <Route path="/dashboard" element={<KnownRedirectRoute />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
