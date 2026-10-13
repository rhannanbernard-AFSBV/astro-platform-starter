import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  AuthUser,
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  setAuthToken,
} from '../api/client';

const STORAGE_KEY = 'omniclean_jwt';

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  tenantName: string | null;
  login: (email: string, password: string, tenantId?: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    tenantId?: string;
    companyName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function storageGet(key: string) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  try {
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* ignore */
  }
}

async function storageDel(key: string) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await storageGet(STORAGE_KEY);
        if (saved) {
          setAuthToken(saved);
          setToken(saved);
          const me = await fetchMe();
          setUser(me.user);
          setTenantName(me.tenant?.name || null);
        }
      } catch {
        setAuthToken(null);
        setToken(null);
        await storageDel(STORAGE_KEY);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantId?: string) => {
      const result = await apiLogin(email, password, tenantId);
      setAuthToken(result.token);
      setToken(result.token);
      setUser(result.user);
      setTenantName(result.tenant.name);
      await storageSet(STORAGE_KEY, result.token);
    },
    []
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      tenantId?: string;
      companyName?: string;
    }) => {
      const result = await apiRegister(input);
      setAuthToken(result.token);
      setToken(result.token);
      setUser(result.user);
      setTenantName(result.tenant.name);
      await storageSet(STORAGE_KEY, result.token);
    },
    []
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setTenantName(null);
    await storageDel(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ ready, token, user, tenantName, login, register, logout }),
    [ready, token, user, tenantName, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
