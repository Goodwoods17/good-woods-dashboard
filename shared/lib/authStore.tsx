"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }

    const sb = getSupabase();

    sb.auth.getUser().then(({ data, error }) => {
      // On error, treat as signed-out rather than leaving the spinner up forever.
      setUser(error ? null : data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    try {
      if (hasSupabase()) {
        await getSupabase().auth.signOut();
      }
    } finally {
      // Always redirect, even if signOut throws — a stuck "Sign out" button
      // that leaves the user on a protected page is worse than a failed call.
      // Hard navigation so middleware sees the cleared cookie immediately.
      window.location.href = "/login";
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
