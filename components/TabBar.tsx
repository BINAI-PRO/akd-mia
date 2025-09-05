import Link from "next/link";
import { useRouter } from "next/router";

const items = [
  { href: "/", label: "Inicio", icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-9z" fill="currentColor"/></svg>
  )},
  { href: "/schedule", label: "Reservas", icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
  )},
  { href: "/events", label: "Eventos", icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M4 6h16v12H4zM8 10h8M8 14h5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
  )},
  { href: "/pricing", label: "Tienda", icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M6 7h12l-1 12H7L6 7z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9 7a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
  )},
  { href: "/menu", label: "Menú", icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
  )},
];

export default function TabBar() {
  const router = useRouter();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-neutral-200">
      <div className="mx-auto max-w-md px-2 py-2 grid grid-cols-5">
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
