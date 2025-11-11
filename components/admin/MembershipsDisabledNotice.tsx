import Link from "next/link";

export function MembershipsDisabledNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-amber-800 shadow-sm">
      <h2 className="text-lg font-semibold text-amber-900">Membresías deshabilitadas</h2>
      <p className="mt-1 text-sm">
        Las membresías están desactivadas desde Configuración. Activa la opción en Recursos → Configuración para volver a
        mostrar la administración de membresías en web y app móvil.
      </p>
      <p className="mt-2 text-sm">
        Mientras permanezcan deshabilitadas no podrás registrar compras ni gestionar planes asociados a membresías.
      </p>
      <Link
        href="/planeacion/settings"
        className="mt-4 inline-flex items-center justify-center rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
      >
        Abrir configuración
      </Link>
    </div>
  );
}

