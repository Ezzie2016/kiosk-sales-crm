import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/modules/auth/use-auth';
import { isProduction, env } from '@/lib/env';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/prospects', label: 'Prospects', end: false },
  { to: '/follow-ups', label: 'Follow-ups', end: false },
  { to: '/leaderboard', label: 'Leaderboard', end: false },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { staff, signOut } = useAuth();

  return (
    <div className="app-shell">
      {!isProduction && (
        <div className="banner">Environment: {env.VITE_APP_ENV.toUpperCase()} — not production data</div>
      )}
      <aside className="sidebar">
        <div className="brand">Kiosk Sales CRM</div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="who">
          {staff?.full_name}
          <br />
          <span className="muted">{staff?.role}</span>
        </div>
        <button className="btn" onClick={() => void signOut()}>Sign out</button>
      </aside>

      <nav className="mobile-nav">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.label}
          </NavLink>
        ))}
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => void signOut()}>Sign out</button>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
