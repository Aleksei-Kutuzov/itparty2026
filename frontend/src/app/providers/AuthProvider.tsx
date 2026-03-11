import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AUTH_TOKEN_KEY, setAuthToken } from "../../api/client";
import type { RegisterPayload, StaffProfile, User } from "../../types/models";

type AuthContextValue = {
  user: User | null;
  staffProfile: StaffProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeStaffProfile = (profile: StaffProfile): StaffProfile => {
  if (profile.is_admin) {
    return {
      ...profile,
      organization_id: profile.organization_id || 0,
      organization_name: profile.organization_name || "Все организации",
    };
  }
  return profile;
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [me, profile] = await Promise.all([api.auth.me(), api.auth.staffProfile()]);
      setUser(me);
      setStaffProfile(normalizeStaffProfile(profile));
      setError(null);
    } catch (err) {
      setUser(null);
      setStaffProfile(null);
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

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await api.auth.register(payload);
      await login(payload.email, payload.password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setUser(null);
    setStaffProfile(null);
    setAuthToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      staffProfile,
      loading,
      error,
      login,
      register,
      logout,
      refresh,
    }),
    [error, loading, login, logout, refresh, register, staffProfile, user],
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
