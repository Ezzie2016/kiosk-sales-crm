import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Staff } from '@/types/domain';
import type { Actor } from '@/modules/authorization/permissions';

export interface AuthState {
  loading: boolean;
  session: Session | null;
  /** The caller's `crm.staff` row, or null if they are signed in but not CRM staff. */
  staff: Staff | null;
  /** Convenience projection used by the permission helpers. */
  actor: Actor | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  reloadStaff: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
