import { NavLink, Outlet } from 'react-router-dom';
import { Banner } from '../components/Banner';
import { useSubscriptionGate } from '../components/SubscriptionGate';

const navItems = [
  { to: '/library', label: 'Library' },
  { to: '/devices', label: 'Devices' },
  { to: '/settings', label: 'Settings' },
  { to: '/logs', label: 'Logs' },
];

export function AppLayout() {
  const { salesStopMessage } = useSubscriptionGate();

  return (
    <div className="flex min-h-screen">
      <nav className="w-52 shrink-0 bg-neutral-900 p-4 text-white">
        <h2 className="mb-4 text-base font-semibold">Digital Shelf</h2>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm ${isActive ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 space-y-6 p-8">
        {salesStopMessage ? <Banner tone="info" message={salesStopMessage} /> : null}
        <Outlet />
      </main>
    </div>
  );
}
