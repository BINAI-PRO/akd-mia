import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

type AuthProfile = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : supabaseBrowser()),
    []
  );
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const profile = useMemo<AuthProfile | null>(() => {
    if (!user) return null;

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;

    const fullName =
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      (metadata.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Usuario";

    const avatarUrl =
      (metadata.avatar_url as string | undefined) ??
      (metadata.avatar as string | undefined) ??
      null;

    const role =
      (metadata.role as string | undefined) ??
      (appMetadata.role as string | undefined) ??
      null;

    const isAdmin =
      Boolean(appMetadata.is_admin ?? metadata.is_admin ?? metadata.admin) ||
      role === "admin";

    const derivedId =
      (metadata.profile_id as string | undefined) ??
      (metadata.client_id as string | undefined) ??
      user.id;

    return {
      id: derivedId,
      fullName,
      avatarUrl,
      email: user.email ?? null,
      role,
      isAdmin,
    };
  }, [user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, [supabase]);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession();
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      signOut,
      refreshSession,
    }),
    [loading, profile, refreshSession, session, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
