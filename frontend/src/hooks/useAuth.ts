import { createContext, createElement, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface AuthResponse {
  status: string;
  user: User;
  token: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  initializing: boolean;
  loading: boolean;
  error: string | null;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistUser(user: User | null) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(() => localStorage.getItem('token'), []);

  const setToken = useCallback((token: string) => {
    localStorage.setItem('token', token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    persistUser(null);
    setIsAuthenticated(false);
    setUser(null);
    setError(null);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setInitializing(false);
      return;
    }

    api
      .post('/auth/verify', {}, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (response.data.status === 'valid') {
          setIsAuthenticated(true);
          setUser(readStoredUser());
        } else {
          logout();
        }
      })
      .catch(() => logout())
      .finally(() => setInitializing(false));
  }, [getToken, logout]);

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<AuthResponse>('/auth/register', { email, password });
      setToken(response.data.token);
      persistUser(response.data.user);
      setUser(response.data.user);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setToken]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<AuthResponse>('/auth/login', { email, password });
      setToken(response.data.token);
      persistUser(response.data.user);
      setUser(response.data.user);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setToken]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      user,
      initializing,
      loading,
      error,
      register,
      login,
      logout,
      getToken,
      setToken
    }),
    [isAuthenticated, user, initializing, loading, error, register, login, logout, getToken, setToken]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
