import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Staff } from '@/types/domain';
import type { Actor } from '@/modules/authorization/permissions';
import { AuthContext, type AuthState } from './use-auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);

  const loadStaff = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setStaff(null);
      return;
    }
    // RLS lets a signed-in user read only their own staff row.
    const { data } = await supabase.from('staff').select('*').eq('id', activeSession.user.id).maybeSingle();
    setStaff((data as Staff | null) ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadStaff(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void loadStaff(newSession);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadStaff]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStaff(null);
  }, []);

  const reloadStaff = useCallback(() => loadStaff(session), [loadStaff, session]);

  const actor: Actor | null = useMemo(
    () => (staff ? { id: staff.id, role: staff.role, isActive: staff.is_active } : null),
    [staff],
  );

  const value = useMemo<AuthState>(
    () => ({ loading, session, staff, actor, signIn, signOut, reloadStaff }),
    [loading, session, staff, actor, signIn, signOut, reloadStaff],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
