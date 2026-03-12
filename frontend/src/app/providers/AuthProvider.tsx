import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AUTH_TOKEN_KEY, setAuthToken } from "../../api/client";
import type { RegisterOrganizationPayload, User } from "../../types/models";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerOrganization: (payload: RegisterOrganizationPayload) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
      setError(null);
    } catch (err) {
      setUser(null);
      setAuthToken(null);
      setError(err instanceof Error ? err.message : "Не удалось получить профиль");
      throw err;
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.auth.login({ email, password });
      setAuthToken(session.access_token);
      await refresh();
    },
    [refresh],
  );

  const registerOrganization = useCallback(async (payload: RegisterOrganizationPayload) => {
    await api.auth.registerOrganization(payload);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAuthToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      login,
      registerOrganization,
      logout,
      refresh,
    }),
    [error, loading, login, logout, refresh, registerOrganization, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth should be used within AuthProvider");
  }
  return context;
};
