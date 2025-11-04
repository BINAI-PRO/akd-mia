import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs } from "@/lib/timezone";

const TIME_ZONE = "Europe/Madrid";
const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

// --- Tipos auxiliares para evitar avisos "untracked" en los joins ---
type SessionJoin = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  class_types?: { name?: string } | null;
  instructors?: { full_name?: string } | null;
  rooms?: { name?: string } | null;
};

type SessionView = {
  classType: string;
  instructor: string;
  room: string;
  dateLabel: string;
  timeLabel: string;
  start: string;
  end: string;
  token?: string | null;
};

type PageData = { id: string; session: SessionView };
type PageProps = { data?: PageData };
type QrTokenRow = { token: string };

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const id = ctx.params?.id as string;

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, session_id")
    .eq("id", id)
    .single();
  if (bookingError || !booking) {
    return { notFound: true };
  }

  const { data: sessionJoin, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, start_time, end_time, capacity, class_types(name), instructors(full_name), rooms(name)"
    )
    .eq("id", booking.session_id)
    .single();
  if (sessionError || !sessionJoin) {
    return { notFound: true };
  }

  const sj = sessionJoin as SessionJoin;

  const { data: qr } = await supabaseAdmin
    .from("qr_tokens")
    .select("token")
    .eq("booking_id", id)
    .maybeSingle();
  const tokenValue = (qr as QrTokenRow | null)?.token ?? null;

  const startDate = madridDayjs(sj.start_time, true);
  const dateLabel = DATE_FORMATTER.format(startDate.toDate()).toLocaleUpperCase("es-ES");
  const timeLabel = TIME_FORMATTER.format(startDate.toDate());

  const data: PageData = {
    id,
    session: {
      classType: sj.class_types?.name ?? "Clase",
      instructor: sj.instructors?.full_name ?? "",
      room: sj.rooms?.name ?? "",
      dateLabel,
      timeLabel,
      start: sj.start_time,
      end: sj.end_time,
      token: tokenValue,
    },
  };

  return { props: { data } };
};

export default function BookingDetail({
  data,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { profile } = useAuth();
  const [cancelState, setCancelState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const actorPayload = useMemo(() => {
    return profile?.clientId ? { actorClientId: profile.clientId } : {};
  }, [profile?.clientId]);

  const handleCancel = async () => {
    if (!data?.id || cancelState === "loading" || cancelState === "success") return;
    setCancelState("loading");
    setCancelError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: data.id, ...actorPayload }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo cancelar la reserva");
      }
      setCancelState("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cancelar";
      setCancelError(message);
      setCancelState("error");
    }
  };

  const handleRebook = () => {
    if (!data?.id) return;
    router.push(`/schedule?rebookFrom=${data.id}`);
  };

  if (!data?.session) {
    return (
      <>
        <Head>
          <title>Reserva | AT Pilates Time</title>
        </Head>
        <main className="container-mobile py-6">
          <h1 className="h1 mb-3">Reserva</h1>
          <div className="card p-4">
            <p className="text-neutral-600">No se pudo cargar la información de la reserva.</p>
          </div>
        </main>
      </>
    );
  }

  const s = data.session;

  return (
    <>
      <Head>
        <title>Reserva | {s.classType}</title>
      </Head>

      <main className="container-mobile py-6 space-y-4">
        <h1 className="h1">Reserva</h1>

        <section className="card p-4">
          <h2 className="text-lg font-semibold">{s.classType}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {s.dateLabel} · {s.timeLabel}
          </p>
          <p className="text-sm text-neutral-600">
            {s.room ? `${s.room} · ` : ""}
            {s.instructor}
          </p>
        </section>

        <section className="card p-4 flex flex-col items-center gap-4">
          {s.token ? (
            <>
              <Img
                src={`/api/qr/${s.token}`}
                alt="QR de acceso"
                width={256}
                height={256}
                className="h-64 w-64 object-contain"
                unoptimized
              />
              <a
                href={`/api/qr/${s.token}?download=1`}
                className="btn text-center"
                download
              >
                Descargar QR
              </a>
              <p className="text-center text-xs text-neutral-500">
                Muestra este código al llegar para registrar tu asistencia.
              </p>
            </>
          ) : (
            <p className="text-neutral-600">QR no disponible para esta reserva.</p>
          )}
        </section>

        <section className="card p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelState === "loading" || cancelState === "success"}
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
            >
              {cancelState === "loading"
                ? "Cancelando..."
                : cancelState === "success"
                ? "Reserva cancelada"
                : "Cancelar reserva"}
            </button>

            <button
              type="button"
              onClick={handleRebook}
              className="rounded-md border border-brand-200 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
            >
              Reagendar
            </button>
          </div>

          {cancelState === "success" && (
            <p className="text-xs text-green-600">La reserva se canceló correctamente.</p>
          )}
          {cancelError && cancelState === "error" && (
            <p className="text-xs text-red-600">{cancelError}</p>
          )}
        </section>
      </main>
    </>
  );
}
