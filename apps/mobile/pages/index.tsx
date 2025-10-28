import Link from "next/link";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";

export default function Home() {
  const { profile, user } = useAuth();

  const displayName =
    profile?.fullName?.trim() ??
    profile?.email ??
    user?.email ??
    "Bienvenido";

  const firstName = displayName.split(" ")[0]?.trim() ?? displayName;
  const avatarUrl = profile?.avatarUrl ?? null;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "AT";

  return (
    <section className="px-4 pt-8">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        {avatarUrl ? (
          <Img
            src={avatarUrl}
            alt={displayName}
            width={112}
            height={112}
            className="h-28 w-28 rounded-full object-cover shadow-md"
            unoptimized
          />
        ) : (
          <span className="grid h-28 w-28 place-items-center rounded-full bg-brand-100 text-3xl font-semibold text-brand-700 shadow-md">
            {initials}
          </span>
        )}

        <h1 className="text-3xl font-semibold text-brand-800">
          Hola{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="max-w-xs text-sm text-stone-700">
          Reserva y gestiona tus sesiones en un solo lugar. Estamos listos para tu proxima clase.
        </p>

        <Link href="/schedule" className="btn max-w-xs">
          Ir a Reservas
        </Link>
      </div>
      <div className="h-20" />
    </section>
  );
}
