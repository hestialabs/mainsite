/**
 * @file lib/auth-context.tsx
 * @description Session context with Supabase Auth integration.
 * Manages identity, CSRF tokens, and authority context.
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import * as api from '@/lib/api';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  session: any | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  csrfToken: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyOtp: (email: string, token: string, type: 'signup' | 'recovery') => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isOperator: boolean;
}


const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_PRIORITY: Record<string, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    token: null,
    loading: true,
    error: null,
    csrfToken: null,
  });
  const router = useRouter();

  const fetchCsrf = useCallback(async () => {
    try {
      const res = await api.getCsrfToken();
      const token = res.data.csrfToken;
      setState(s => ({ ...s, csrfToken: token }));
      api.setCsrfToken(token);
      return token;
    } catch (err) {
      console.error('Failed to fetch CSRF token:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    try {
      const res = await api.getMe(session.access_token);
      if (res.data.authenticated) {
        setState(s => ({
          ...s,
          user: res.data.user as User,
          session,
          token: session.access_token,
          loading: false
        }));
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  }, []);

  useEffect(() => {
    // Initial fetch of CSRF token
    fetchCsrf();

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState(s => ({ ...s, session, loading: true }));
        refreshProfile();
      } else {
        setState(s => ({ ...s, session: null, user: null, loading: false }));
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setState(s => ({ ...s, session, token: session?.access_token ?? null, loading: true }));

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await refreshProfile();
      } else if (event === 'SIGNED_OUT') {
        setState({ user: null, session: null, token: null, loading: false, error: null, csrfToken: state.csrfToken });
        router.push('/signin');
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, [router, refreshProfile, fetchCsrf]);

  const signUp = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }

    setState(s => ({ ...s, loading: false }));
    toast.success('Registration successful! Please check your email for the verification code.');
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }
    // Session state will be updated by onAuthStateChange listener
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string, type: 'signup' | 'recovery') => {
    setState(s => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type
    });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }

    toast.success('Verification successful!');
    router.push('/dashboard');
  }, [router]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    try {
      await api.logout(); // Clean backend cookie
    } catch {
      // Best-effort
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }

    setState(s => ({ ...s, loading: false }));
    toast.success('Password reset link sent to your email.');
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }

    setState(s => ({ ...s, loading: false }));
    toast.success('Password updated successfully!');
    router.push('/dashboard');
  }, [router]);

  const isAdmin = (ROLE_PRIORITY[state.user?.role ?? ''] ?? 0) >= ROLE_PRIORITY.admin;
  const isOperator = (ROLE_PRIORITY[state.user?.role ?? ''] ?? 0) >= ROLE_PRIORITY.operator;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        verifyOtp,
        requestPasswordReset,
        updatePassword,
        refreshProfile,
        isAdmin,
        isOperator,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

