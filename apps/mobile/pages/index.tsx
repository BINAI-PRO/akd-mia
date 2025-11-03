import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";

type MembershipSummary = {
  id: string;
  name: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  autoRenew: boolean;
  isActive: boolean;
  price: number | null;
  currency: string | null;
  category: string | null;
};

type MembershipState =
  | { status: "idle" | "loading"; membership: null; error: null }
  | { status: "ready"; membership: MembershipSummary | null; error: null }
  | { status: "error"; membership: null; error: string };

const RECEPTION_EMAIL =
  process.env.NEXT_PUBLIC_RECEPTION_EMAIL ?? "contacto@atpilatestime.com";

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function Home() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [membershipState, setMembershipState] = useState<MembershipState>({
    status: "idle",
    membership: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMembershipState({ status: "loading", membership: null, error: null });

    fetch("/api/my/membership", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "No se pudo cargar la membresia");
        }
        return response.json() as Promise<{ membership: MembershipSummary | null }>;
      })
      .then((payload) => {
        if (!active) return;
        setMembershipState({ status: "ready", membership: payload.membership, error: null });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar la membresia";
    setMembershipState({ status: "error", membership: null, error: message });
  });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

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

  const membershipCard = useMemo(() => {
    if (membershipState.status === "loading" || membershipState.status === "idle") {
      return (
        <div className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 shadow-sm">
          <div className="h-4 w-1/3 rounded bg-neutral-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-neutral-200" />
          <div className="mt-4 flex gap-2">
            <div className="h-9 w-24 rounded bg-neutral-200" />
            <div className="h-9 w-24 rounded bg-neutral-200" />
          </div>
        </div>
      );
    }

    if (membershipState.status === "error") {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
          {membershipState.error ?? "No se pudo obtener informacion de la membresia."}
        </div>
      );
    }

    const membership = membershipState.membership;
    const isActive = membership?.isActive ?? false;
    const statusLabel = membership
      ? isActive
        ? `Activa hasta ${formatDate(membership.endDate ?? membership.nextBillingDate)}`
        : `Estado: ${(membership.status ?? "INACTIVA").toUpperCase()}`
      : "Membresia inactiva";

    return (
      <div
        className={`rounded-2xl border px-4 py-4 shadow-sm ${
          isActive
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {membership?.name ?? "Membresia"}
            </p>
            <p className="text-xs text-neutral-600">{statusLabel}</p>
            {membership?.autoRenew && (
              <p className="mt-1 text-[11px] text-neutral-500">
                Renovacion automatica activada.
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              isActive
                ? "bg-emerald-600/10 text-emerald-700"
                : "bg-amber-600/10 text-amber-700"
            }`}
          >
            {isActive ? "Activa" : "Inactiva"}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/membership")}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Gestionar membresia
          </button>
          <a
            href={`mailto:${RECEPTION_EMAIL}?subject=Consulta%20sobre%20membresia`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Escribir a recepcion
          </a>
        </div>
      </div>
    );
  }, [membershipState, router]);

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
      <div className="mx-auto mt-10 max-w-md">{membershipCard}</div>
      <div className="h-20" />
    </section>
  );
}

