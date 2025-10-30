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
import { isRefreshTokenMissingError } from "@/lib/auth-errors";
import { supabaseBrowser } from "@/lib/supabase-browser";

type AuthProfile = {
  authUserId: string;
  clientId: string | null;
  fullName: string;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  role: string | null;
  isAdmin: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const deriveBaseProfile = (source: User): AuthProfile => {
  const metadata = (source.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (source.app_metadata ?? {}) as Record<string, unknown>;

  const fullName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (metadata.display_name as string | undefined) ??
    source.email?.split("@")[0] ??
    "Usuario";

  const avatarUrl =
    (metadata.avatar_url as string | undefined) ??
    (metadata.avatar as string | undefined) ??
    null;

  const phone = (metadata.phone as string | undefined) ?? null;
  const role =
    (metadata.role as string | undefined) ??
    (appMetadata.role as string | undefined) ??
    null;

  const isAdmin =
    Boolean(appMetadata.is_admin ?? metadata.is_admin ?? metadata.admin) ||
    role === "admin";

  const possibleClientId =
    (metadata.client_id as string | undefined) ??
    (metadata.profile_id as string | undefined) ??
    null;

  return {
    authUserId: source.id,
    clientId: possibleClientId,
    fullName,
    avatarUrl,
    email: source.email ?? null,
    phone,
    status: null,
    role,
    isAdmin,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : supabaseBrowser()),
    []
  );
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!supabase) return;

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          if (isRefreshTokenMissingError(error)) {
            await supabase.auth.signOut();
            if (!mounted) return;
          }
          setSession(null);
          setUser(null);
        } else {
          setSession(data.session ?? null);
          setUser(data.session?.user ?? null);
        }
      } catch {
        if (!mounted) return;
        setSession(null);
        setUser(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    void initializeSession();

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

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfile(deriveBaseProfile(user));

    if (typeof window === "undefined") return;

    const controller = new AbortController();
    let active = true;
    setProfileLoading(true);

    fetch("/api/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error ?? "me endpoint failed");
        }
        return response.json() as Promise<{
          profile: Partial<AuthProfile> & { authUserId: string };
        }>;
      })
      .then(({ profile: remoteProfile }) => {
        if (!active) return;
        setProfile((current) => {
          const base = current ?? deriveBaseProfile(user);
          return {
            ...base,
            ...remoteProfile,
            clientId: remoteProfile.clientId ?? base.clientId,
            avatarUrl: remoteProfile.avatarUrl ?? base.avatarUrl,
            email: remoteProfile.email ?? base.email,
            phone: remoteProfile.phone ?? base.phone,
            fullName: remoteProfile.fullName ?? base.fullName,
            status: remoteProfile.status ?? base.status,
            role: remoteProfile.role ?? base.role,
            isAdmin:
              remoteProfile.isAdmin !== undefined
                ? remoteProfile.isAdmin
                : base.isAdmin,
          };
        });
      })
      .catch(() => {
        if (!active) return;
        // silently ignore; base profile already set
      })
      .finally(() => {
        if (!active) return;
        setProfileLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, [supabase]);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (isRefreshTokenMissingError(error)) {
          await supabase.auth.signOut();
        }
        setSession(null);
        setUser(null);
        return;
      }
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    } catch {
      setSession(null);
      setUser(null);
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
      profileLoading,
      signOut,
      refreshSession,
    }),
    [loading, profile, profileLoading, refreshSession, session, signOut, user]
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
