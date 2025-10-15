export type SessionSummary = {
  id: string;
  capacity: number;
  current_occupancy: number;
  startLabel: string;
  classType: string;
  instructor: string;
  room: string;
  duration: number;
};

type SessionCardProps = {
  session: SessionSummary & { _pending?: boolean };
  onReserve: (id: string) => void;
};

export default function SessionCard({ session, onReserve }: SessionCardProps) {
  const spots = session.capacity - session.current_occupancy;
  const soldOut = spots <= 0;
  const pending = !!session._pending;
  return (
    <div className="relative card p-4">
      <div className="text-sm text-neutral-500">{session.startLabel}</div>
      <h3 className="font-semibold">{session.classType}</h3>
      <p className="text-sm text-neutral-500">{session.instructor} - {session.room}</p>
      <p className="text-xs text-neutral-500">{session.duration} min</p>

      <div className="absolute right-3 top-3">
        {soldOut ? (
          <button disabled className="rounded-full border bg-white px-4 py-2 text-neutral-400">
            Reservar
          </button>
        ) : (
          <button
            onClick={() => onReserve(session.id)}
            disabled={pending}
            aria-busy={pending}
            className={`rounded-full px-4 py-2 text-white shadow transition ${
              pending
                ? "bg-brand-400 cursor-not-allowed opacity-70"
                : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            {pending ? "Reservando..." : "Reservar"}
          </button>
        )}
      </div>

      <div className="mt-3">
        {soldOut ? (
          <span className="badge-red">Completo</span>
        ) : (
          <span className="badge-green">{spots} lugares</span>
        )}
      </div>
    </div>
  );
}


