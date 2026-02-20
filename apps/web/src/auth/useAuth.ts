import { useState, useEffect, useCallback } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
  maxCloudProjects: number;
  projectCount: number;
  displayName?: string;
}

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  authEnabled: boolean;
  /** Call to get current access token (handles refresh). Returns null if not authenticated. */
  getAccessToken: () => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  confirmRegistration: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export function useAuth(authEnabled: boolean): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authEnabled) return null;
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, [authEnabled]);

  /** Fetch user profile from /api/me after authentication */
  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const profile = await res.json();
        setUser(profile);
      }
    } catch {
      // API unreachable — user stays null
    }
  }, []);

  // Check existing session on mount
  useEffect(() => {
    if (!authEnabled) {
      setIsLoading(false);
      return;
    }

    async function checkSession() {
      try {
        await getCurrentUser();
        const token = await getAccessToken();
        if (token) {
          setIsAuthenticated(true);
          await fetchProfile(token);
        }
      } catch {
        // No session
      } finally {
        setIsLoading(false);
      }
    }

    checkSession();
  }, [authEnabled, getAccessToken, fetchProfile]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) {
        setIsAuthenticated(true);
        const token = await getAccessToken();
        if (token) await fetchProfile(token);
      }
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
      throw err;
    }
  }, [getAccessToken, fetchProfile]);

  const register = useCallback(async (email: string, password: string): Promise<{ needsConfirmation: boolean }> => {
    setError(null);
    try {
      const result = await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      return { needsConfirmation: !result.isSignUpComplete };
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
      throw err;
    }
  }, []);

  const confirmRegistration = useCallback(async (email: string, code: string) => {
    setError(null);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
    } catch (err: any) {
      setError(err.message || 'Confirmation failed');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return {
    isAuthenticated,
    isLoading,
    user,
    authEnabled,
    getAccessToken,
    login,
    register,
    confirmRegistration,
    logout,
    error,
    clearError,
  };
}
