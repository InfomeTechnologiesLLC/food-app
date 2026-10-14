import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, loadToken, saveToken, setUnauthorizedHandler, ApiError } from '@/lib/api';
import { readLocal, writeLocal, removeLocal } from '@/lib/local-store';
import type { Preferences, BodyMeasurements, User } from '@/lib/types';
import type { TrainingPreferences } from '@/lib/exercise-types';
interface AuthContextValue {
  user: User | null; loading: boolean; needsSignIn: boolean;
  signIn: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>; updateBody: (body: BodyMeasurements) => Promise<void>; updateTraining: (training: TrainingPreferences) => Promise<void>; refreshUser: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const remember = useCallback((next: User) => { setUser(next); writeLocal('auth', 'user', next); }, []);
  const signOut = useCallback(async () => {
    await saveToken(null); removeLocal('auth', 'user'); queryClient.clear(); setUser(null); setNeedsSignIn(false);
  }, [queryClient]);
  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsSignIn(true));
    let cancelled = false;
    (async () => {
      try {
        if (await loadToken()) {
          const cached = readLocal<User>('auth', 'user');
          if (cached && !cancelled) { setUser(cached); setLoading(false); }
          try { const current = await api<User>('/auth/me', { timeoutMs: 15000 }); if (!cancelled) { remember(current); setNeedsSignIn(false); } }
          catch (error) { if (error instanceof ApiError && error.status === 401 && !cancelled) setNeedsSignIn(true); }
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; setUnauthorizedHandler(() => {}); };
  }, [remember]);
  const authenticate = async (path: string, email: string, password: string) => {
    const { token } = await api<{ token: string }>(path, { method: 'POST', body: { email, password } });
    const current = await api<User>('/auth/me', { headers: { authorization: `Bearer ${token}` } });
    removeLocal('auth', 'user');
    await saveToken(token);
    queryClient.clear(); remember(current); setNeedsSignIn(false);
  };
  const value: AuthContextValue = {
    user, loading, needsSignIn,
    signIn: (email, password) => authenticate('/auth/login', email, password),
    signUp: (email, password) => authenticate('/auth/register', email, password), signOut,
    refreshUser: async () => { try { remember(await api<User>('/auth/me')); setNeedsSignIn(false); } catch { /* Keep authenticated offline view. */ } },
    updatePreferences: async prefs => remember(await api<User>('/me/preferences', { method: 'PATCH', body: prefs })),
    updateBody: async body => remember(await api<User>('/me/body', { method: 'PATCH', body })),
    updateTraining: async training => remember(await api<User>('/me/training', { method: 'PATCH', body: training })),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used inside AuthProvider'); return ctx; }
