import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setUnauthorizedHandler } from '../services/api';
import { authService } from '../services/auth.service';
import type { AuthUser } from '../types';
import { adminTokenStore } from '../utils/storage';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** True until the stored token has been validated against the API. */
  initialising: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => adminTokenStore.get());
  // Only "initialising" when there is actually a stored token to validate.
  const [initialising, setInitialising] = useState(() => Boolean(adminTokenStore.get()));

  const logout = useCallback(() => {
    adminTokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  // A 401 on any admin call means the session is gone: drop local state.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      adminTokenStore.clear();
      setToken(null);
      setUser(null);
    });
  }, []);

  // Validate a stored token on boot so refreshes keep the admin signed in.
  useEffect(() => {
    let cancelled = false;
    const stored = adminTokenStore.get();
    if (!stored) return undefined;

    authService
      .me()
      .then(({ user: fetched }) => {
        if (cancelled) return;
        setUser(fetched);
        setToken(stored);
      })
      .catch(() => {
        if (cancelled) return;
        adminTokenStore.clear();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password);
    adminTokenStore.set(result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await authService.register(name, email, password);
    adminTokenStore.set(result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, token, initialising, login, register, logout }),
    [user, token, initialising, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
