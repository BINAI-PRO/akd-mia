import Link from "next/link";
import { useRouter } from "next/router";

const items = [
  {
    href: "/",
    label: "Inicio",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7">
        <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-5v-6h-4v6H5a2 2 0 0 1-2-2v-9z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/schedule",
    label: "Reservas",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7">
        <path
          d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    href: "/my/reservations",
    label: "Mis reservas",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7">
        <path
          d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/plans",
    label: "Tarifas",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7">
        <path
          d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M4 7l2-3h12l2 3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M9 12h6M9 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function TabBar() {
  const router = useRouter();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-neutral-200">
      <div className="mx-auto w-full max-w-md px-2 py-2 grid grid-cols-4">
        {items.map(it => {
          const active = router.pathname === it.href;
          return (
            <Link key={it.href} href={it.href} className="flex flex-col items-center gap-1 py-1">
              <span className={`rounded-full p-2 ${active ? "bg-brand-50 text-brand-700" : "text-neutral-600"}`}>
                {it.icon}
              </span>
              <span className={`text-[11px] ${active ? "text-brand-700 font-semibold" : "text-neutral-600"}`}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
