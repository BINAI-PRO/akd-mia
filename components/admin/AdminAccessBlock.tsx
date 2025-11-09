import { ACCESS_LABELS, type AccessLevel } from "@/lib/admin-access";

type Props = {
  feature?: string;
  requiredLevel?: AccessLevel;
  className?: string;
};

export function AdminAccessBlock({ feature = "esta sección", requiredLevel, className }: Props) {
  const label = requiredLevel ? ACCESS_LABELS[requiredLevel] : "los permisos requeridos";

  return (
    <div
      className={`rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700 ${className ?? ""}`}
    >
      No tienes permisos de {label.toLowerCase()} para acceder a {feature}.
    </div>
  );
}

