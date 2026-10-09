import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, loadToken, saveToken, setUnauthorizedHandler } from '@/lib/api';
import type { Preferences, User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await saveToken(null);
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      try {
        if (await loadToken()) setUser(await api<User>('/auth/me'));
      } catch {
        // Offline or expired token: fall through to the login screen
      } finally {
        setLoading(false);
      }
    })();
  }, [signOut]);

  const authenticate = async (path: string, email: string, password: string) => {
    const { token } = await api<{ token: string }>(path, { method: 'POST', body: { email, password } });
    await saveToken(token);
    setUser(await api<User>('/auth/me'));
  };

  const value: AuthContextValue = {
    user,
    loading,
    signIn: (email, password) => authenticate('/auth/login', email, password),
    signUp: (email, password) => authenticate('/auth/register', email, password),
    signOut,
    refreshUser: async () => {
      setUser(await api<User>('/auth/me').catch(() => user));
    },
    updatePreferences: async (prefs) => {
      setUser(await api<User>('/me/preferences', { method: 'PATCH', body: prefs }));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
