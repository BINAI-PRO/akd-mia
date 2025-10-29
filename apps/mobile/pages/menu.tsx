import Link from "next/link";
import { useAuth } from "@/components/auth/AuthContext";

const shortcuts = [
  {
    href: "/my/reservations",
    title: "Mis reservas",
    description: "Revisa tus clases próximas, cancela o reagenda cuando lo necesites.",
  },
  {
    href: "/schedule",
    title: "Explorar horario",
    description: "Reserva una nueva sesión desde el calendario semanal.",
  },
  {
    href: "/pricing",
    title: "Planes y paquetes",
    description: "Consulta los planes disponibles y gestiona tus compras.",
  },
];

export default function MenuPage() {
  const { profile } = useAuth();
  const firstShortcut = shortcuts[0];
  const remainingShortcuts = shortcuts.slice(1);

  return (
    <main className="container-mobile py-6 pb-24 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900">Menú</h1>
        <p className="text-sm text-neutral-500">
          {profile?.fullName ? `Hola, ${profile.fullName.split(" ")[0]}.` : "Gestiona tu cuenta y reservas desde aquí."}
        </p>
      </header>

      {firstShortcut && (
        <Link
          href={firstShortcut.href}
          className="block rounded-2xl border border-brand-100 bg-brand-50 px-4 py-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-brand-700">{firstShortcut.title}</p>
          <p className="text-sm text-brand-700/80 mt-1">{firstShortcut.description}</p>
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Accesos rápidos</h2>
        <div className="space-y-2">
          {remainingShortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200 hover:shadow-md"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                <p className="text-xs text-neutral-500">{item.description}</p>
              </div>
              <span className="text-neutral-400">&gt;</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
