import type { ReactNode } from "react";
import type { AdminFeatureKey, AccessLevel } from "@/lib/admin-access";
import { AdminAccessBlock } from "@/components/admin/AdminAccessBlock";
import { useAdminAccess, type AdminAccessInfo } from "@/hooks/useAdminAccess";

type Props = {
  feature: AdminFeatureKey;
  featureLabel: string;
  minLevel?: AccessLevel;
  loadingMessage?: string;
  children: (access: AdminAccessInfo) => ReactNode;
};

const meetsRequirement = (access: AdminAccessInfo, minLevel: AccessLevel) => {
  if (minLevel === "READ") return access.canView;
  if (minLevel === "EDIT") return access.canEdit;
  if (minLevel === "FULL") return access.canDelete;
  return true;
};

export function AdminAccessContent({
  feature,
  featureLabel,
  minLevel = "READ",
  loadingMessage = "Cargando permisos...",
  children,
}: Props) {
  const access = useAdminAccess(feature);

  if (access.loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        {loadingMessage}
      </div>
    );
  }

  if (!meetsRequirement(access, minLevel)) {
    return <AdminAccessBlock feature={featureLabel} requiredLevel={minLevel} />;
  }

  return <>{children(access)}</>;
}

