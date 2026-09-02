import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './use-auth';

export function LoginPage() {
  const { session, staff, signIn } = useAuth();
  const location = useLocation() as { state?: { reason?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && staff && staff.is_active) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  return (
    <div className="content" style={{ maxWidth: 380, marginTop: '10vh' }}>
      <div className="card">
        <h1 style={{ marginBottom: 4 }}>Kiosk Sales CRM</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>Sign in to continue.</p>

        {location.state?.reason === 'not-staff' && (
          <div className="warn" style={{ marginBottom: 16 }}>
            This account is not set up as CRM staff. Ask an admin to add you.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="warn" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
