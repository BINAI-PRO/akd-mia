import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";

export default function Header() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const displayName = useMemo(() => {
    if (profile?.fullName) return profile.fullName;
    if (profile?.email) return profile.email;
    return "Usuario";
  }, [profile?.email, profile?.fullName]);

  const avatarUrl = profile?.avatarUrl ?? null;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    await router.replace("/login");
  };

  const goToProfile = async () => {
    setMenuOpen(false);
    await router.push("/profile");
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-800 bg-brand-900 text-brand-50 shadow">
      <div className="mx-auto flex w-full max-w-md items-center gap-1.5 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Akdēmia"
          className="h-12 w-auto shrink-0"
          width={160}
          height={56}
        />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-none text-white">Akdēmia</h1>
          <p className="text-xs leading-none text-brand-200">Pro Fitness</p>
        </div>

        <div className="relative ml-auto flex items-center gap-1.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-full border border-brand-700 p-[2px] shadow-md transition hover:border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {avatarUrl ? (
              <Img
                src={avatarUrl}
                alt={displayName}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-900">
                {initials || "U"}
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 w-44 rounded-lg border border-brand-100 bg-white text-sm text-neutral-800 shadow-lg">
              <button
                type="button"
                onClick={goToProfile}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-brand-50"
              >
                <span className="material-icons-outlined text-base text-brand-700">person</span>
                Perfil
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-brand-50"
              >
                <span className="material-icons-outlined text-base text-brand-700">logout</span>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


