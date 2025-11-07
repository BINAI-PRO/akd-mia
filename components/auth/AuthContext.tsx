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
  authUserId: string;
  clientId: string | null;
  fullName: string;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  role: string | null;
  isAdmin: boolean;
  staffId: string | null;
  permissions: string[];
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  reloadProfile: () => Promise<void>;
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
    staffId: null,
    permissions: [],
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
  const [profileLoading, setProfileLoading] = useState(true);

  const performSignOut = useCallback(
    async (options?: { redirect?: boolean; reason?: string }) => {
      try {
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch {
        // ignore sign out errors
      } finally {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        setProfileLoading(false);
        if (options?.redirect && typeof window !== "undefined") {
          const loginUrl = new URL("/login", window.location.origin);
          if (options.reason) {
            loginUrl.searchParams.set("error", options.reason);
          }
          const shouldPreservePath =
            options.reason !== "staff_required" &&
            window.location.pathname !== "/login";
          if (shouldPreservePath) {
            const redirectValue = `${window.location.pathname}${window.location.search ?? ""}`;
            loginUrl.searchParams.set("redirectTo", redirectValue);
          }
          window.location.replace(loginUrl.toString());
        }
      }
    },
    [supabase]
  );

  const reloadProfile = useCallback(async () => {
    if (!user || typeof window === "undefined") {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const response = await fetch("/api/me");
      if (response.status === 401 || response.status === 403) {
        await performSignOut({
          redirect: true,
          reason: response.status === 403 ? "staff_required" : "auth_required",
        });
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to load profile");
      }
      const payload = (await response.json().catch(() => null)) as
        | { profile?: Partial<AuthProfile> & { authUserId: string }; error?: string }
        | null;

      if (!payload || typeof payload !== "object" || !payload.profile) {
        return;
      }

      const remoteProfile = payload.profile;
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
          staffId: remoteProfile.staffId ?? base.staffId,
          permissions: Array.isArray(remoteProfile.permissions)
            ? remoteProfile.permissions
            : base.permissions,
        };
      });
    } catch (error) {
      console.error("[AuthContext] reloadProfile failed", error);
    } finally {
      setProfileLoading(false);
    }
  }, [performSignOut, user]);

  useEffect(() => {
    let mounted = true;

    if (!supabase) return;

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          await performSignOut();
          if (!mounted) return;
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
  }, [performSignOut, supabase]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfile(deriveBaseProfile(user));
    void reloadProfile();
  }, [user, reloadProfile]);

  const signOut = useCallback(async () => {
    await performSignOut();
  }, [performSignOut]);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        await performSignOut();
        return;
      }
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    } catch {
      await performSignOut();
    } finally {
      setLoading(false);
    }
  }, [performSignOut, supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      profileLoading,
      signOut,
      refreshSession,
      reloadProfile,
    }),
    [loading, profile, profileLoading, refreshSession, reloadProfile, session, signOut, user]
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
