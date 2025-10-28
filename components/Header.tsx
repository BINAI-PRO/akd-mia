import { useMemo } from "react";
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

  const handleSignOut = async () => {
    await signOut();
    await router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        <Img
          src="/logo.svg"
          alt="AT Pilates Time"
          width={160}
          height={56}
          className="h-12 w-auto shrink-0"
          unoptimized
        />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-none">AT Pilates Time</h1>
          <p className="text-xs leading-none text-neutral-500">ATP Tu Fit App</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {avatarUrl ? (
            <Img
              src={avatarUrl}
              alt={displayName}
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover shadow"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 shadow">
              {initials || "U"}
            </span>
          )}
          <div className="flex flex-col text-right">
            <span className="text-sm font-semibold leading-tight text-neutral-800">
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
