import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "./AuthContext";

type Props = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: Props) {
  const router = useRouter();
  const { user, loading } = useAuth();

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
