import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "./AuthContext";

type Props = {
  children: ReactNode;
  requireProfileCompletion?: boolean;
};

export function ProtectedRoute({ children, requireProfileCompletion = false }: Props) {
  const router = useRouter();
  const { user, loading, profile, profileLoading } = useAuth();
  const onboardingPath = "/setup/profile";
  const isOnboardingRoute = router.pathname === onboardingPath;
  const needsPhone =
    requireProfileCompletion &&
    Boolean(user) &&
    !profileLoading &&
    (!profile?.phone || profile.phone.trim().length === 0);

  useEffect(() => {
    if (!loading && !user) {
      const redirectTo =
        router.asPath && router.asPath !== "/login" ? router.asPath : undefined;
      void router.replace({
        pathname: "/login",
        query: redirectTo ? { redirectTo } : undefined,
      });
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && needsPhone && !isOnboardingRoute) {
      const redirectTo =
        router.asPath && router.asPath !== onboardingPath ? router.asPath : undefined;
      void router.replace({
        pathname: onboardingPath,
        query: redirectTo ? { redirectTo } : undefined,
      });
    }
  }, [isOnboardingRoute, loading, needsPhone, router, user, onboardingPath]);

  if (loading || (requireProfileCompletion && !isOnboardingRoute && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (needsPhone && !isOnboardingRoute) {
    return null;
  }

  return <>{children}</>;
}
