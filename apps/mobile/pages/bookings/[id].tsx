// pages/bookings/[id].tsx

import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Img from "@/components/Img";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  // 1) Booking -> session_id
  const { data: booking, error: eBk } = await supabaseAdmin
    .from("bookings")
    .select("id, session_id")
    .eq("id", id)
    .single();

  if (eBk || !booking) {
    return { notFound: true };
  }

  // 2) Sesión con joins
  const { data: s, error: eSess } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, start_time, end_time, capacity, class_types(name), instructors(full_name), rooms(name)"
    )
    .eq("id", booking.session_id)
    .single();

  if (eSess || !s) {
    return { notFound: true };
  }

  const sj = s as SessionJoin;

  // 3) Token QR
  const { data: qr } = await supabaseAdmin
    .from("qr_tokens")
    .select("token")
    .eq("booking_id", id)
    .maybeSingle();

  const tokenValue = (qr as QrTokenRow | null)?.token ?? null;

  // 4) Formato de fecha/hora (es-MX, mayúsculas)
  const start = new Date(sj.start_time);
  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(start)
    .toUpperCase();

  const timeLabel = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);

  const data: PageData = {
    id,
    session: {
      classType: sj.class_types?.name ?? "CLASE",
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
  // Guardas: si por alguna razón no llegó data, mostramos mensaje amable
  if (!data?.session) {
    return (
      <>
        <Head>
          <title>Reserva | AT Pilates Time</title>
        </Head>
        <main className="container-mobile py-6">
          <h1 className="h1 mb-3">Reserva</h1>
          <div className="card p-4">
            <p className="text-neutral-600">
              No se pudo cargar la información de la reserva.
            </p>
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
          <p className="text-sm text-neutral-600 mt-1">
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
                className="w-64 h-64 object-contain text-center"
                unoptimized
              />
              <a
                href={`/api/qr/${s.token}?download=1`}
                className="btn text-center"
                download
              >
                Descargar QR
              </a>
              <p className="text-xs text-neutral-500 text-center">
                Muestra este código al llegar para registrar tu asistencia.
              </p>
            </>
          ) : (
            <p className="text-neutral-600">
              QR no disponible para esta reserva.
            </p>
          )}
        </section>
      </main>
    </>
  );
}


