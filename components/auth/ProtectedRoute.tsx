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
  const { user, loading, profileLoading, profileCompleted } = useAuth();
  const onboardingPath = "/setup/profile";
  const isOnboardingRoute = router.pathname === onboardingPath;
  const needsProfileCompletion =
    requireProfileCompletion &&
    Boolean(user) &&
    !profileLoading &&
    !profileCompleted;

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
    if (!loading && user && needsProfileCompletion && !isOnboardingRoute) {
      const redirectTo =
        router.asPath && router.asPath !== onboardingPath ? router.asPath : undefined;
      void router.replace({
        pathname: onboardingPath,
        query: redirectTo ? { redirectTo } : undefined,
      });
    }
  }, [isOnboardingRoute, loading, needsProfileCompletion, router, user, onboardingPath]);

  if (loading || (requireProfileCompletion && !isOnboardingRoute && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Redirigiendo...
      </div>
    );
  }

  if (needsProfileCompletion && !isOnboardingRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Cargando perfil...
      </div>
    );
  }

  return <>{children}</>;
}
