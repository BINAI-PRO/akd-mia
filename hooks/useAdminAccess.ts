import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthContext";
import type { AccessLevel, AdminFeatureKey } from "@/lib/admin-access";
import { getAccessBooleans } from "@/lib/admin-access";

export type AdminAccessInfo = {
  level: AccessLevel | null;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  loading: boolean;
};

export function useAdminAccess(feature?: AdminFeatureKey): AdminAccessInfo {
  const { profile, profileLoading } = useAuth();
  const role = profile?.role ?? null;

  const memoized = useMemo(() => {
    if (!feature) {
      return {
        level: "FULL" as AccessLevel,
        canView: true,
        canEdit: true,
        canDelete: true,
      };
    }
    return getAccessBooleans(role, feature);
  }, [role, feature]);

  return {
    ...memoized,
    level: profileLoading && !role && feature ? null : memoized.level,
    loading: feature ? profileLoading : false,
  };
}
