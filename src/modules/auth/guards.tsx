import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './use-auth';

/**
 * Gate for any authenticated CRM route. A signed-in user without an active
 * `crm.staff` row is treated as not-staff and bounced to the login screen with a
 * message — RLS would give them an empty app anyway, this just makes it explicit.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { loading, session, staff } = useAuth();
  const location = useLocation();

  if (loading) return <div className="content">Loading…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!staff || !staff.is_active) {
    return <Navigate to="/login" replace state={{ reason: 'not-staff' }} />;
  }
  return <>{children}</>;
}

/** Gate for admin-only routes. Salespeople get a plain 'not authorized' panel. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, staff } = useAuth();
  if (loading) return <div className="content">Loading…</div>;
  if (!staff || staff.role !== 'admin' || !staff.is_active) {
    return (
      <div className="content">
        <div className="card">
          <h2>Not authorized</h2>
          <p className="muted">This area is for admins only.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
