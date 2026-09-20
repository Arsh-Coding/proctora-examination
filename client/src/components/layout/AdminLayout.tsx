import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { Button } from '../ui/Button';
import { Logo } from './Logo';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z' },
  { to: '/exams', label: 'Exams', icon: 'M4 4h16v4H4zM4 10h16v10H4zm3 3h10M7 16h6' },
  { to: '/sessions', label: 'Attempts', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v6l5 3 1-1.7-4-2.3z' },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5 shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <div className="mb-4 px-2 pt-2">
        <Logo className="text-white" />
        <p className="mt-1 text-[11px] font-medium tracking-wide text-ink-400 uppercase">
          Proctoring console
        </p>
      </div>

      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-ink-300 hover:bg-ink-800 hover:text-white'
            )
          }
        >
          <NavIcon path={item.icon} />
          {item.label}
        </NavLink>
      ))}

      <div className="mt-auto border-t border-ink-800 pt-3">
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-white">
            {user ? initials(user.name) : '–'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
            <span className="block truncate text-xs text-ink-400">{user?.email}</span>
          </span>
        </div>
        <Button variant="ghost" size="sm" fullWidth className="text-ink-300 hover:bg-ink-800 hover:text-white" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-svh bg-ink-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-ink-900 lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-80 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative h-full w-64 bg-ink-900">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" fill="none" />
            </svg>
          </button>
          <Logo />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
