import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAuthTokenGetter, useLogout, type AuthResponse, type User } from '@workspace/api-client-react';

type AuthContextValue = {
  token: string | null;
  user: User | null;
  setSession: (response: AuthResponse) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const logoutMutation = useLogout();

  useEffect(() => {
    setAuthTokenGetter(() => token);
    return () => setAuthTokenGetter(null);
  }, [token]);

  const setSession = useCallback((response: AuthResponse) => {
    setToken(response.accessToken);
    setUser(response.user);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    clearSession();
  }, [clearSession, logoutMutation]);

  const value = useMemo(
    () => ({ token, user, setSession, clearSession, logout, isLoggingOut: logoutMutation.isPending }),
    [clearSession, logout, logoutMutation.isPending, setSession, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}