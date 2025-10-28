import dayjs from "dayjs";

export type SessionSummary = {
  id: string;
  capacity: number;
  current_occupancy: number;
  startLabel: string;
  classType: string;
  instructor: string;
  room: string;
  duration: number;
  canBook: boolean;
  availableFrom: string | null;
  availableFromLabel?: string;
};

type SessionCardProps = {
  session: SessionSummary & { _pending?: boolean };
  onReserve: (id: string) => void;
};

export default function SessionCard({ session, onReserve }: SessionCardProps) {
  const spots = session.capacity - session.current_occupancy;
  const soldOut = spots <= 0;
  const pending = !!session._pending;
  const canBook = session.canBook;
  const unlockLabel =
    session.availableFromLabel ??
    (session.availableFrom ? dayjs(session.availableFrom).format("DD/MM/YYYY") : undefined);
  const disabledForWindow = !soldOut && !canBook;

  const disableButton = soldOut || pending || disabledForWindow;

  const buttonClass = disableButton
    ? "rounded-full bg-brand-200 px-4 py-2 text-white/80 shadow cursor-not-allowed"
    : "rounded-full bg-brand-500 px-4 py-2 text-white shadow transition hover:bg-brand-600";

  return (
    <div className="relative card p-4">
      <div className="text-sm text-neutral-500">{session.startLabel}</div>
      <h3 className="font-semibold">{session.classType}</h3>
      <p className="text-sm text-neutral-500">
        {session.instructor} - {session.room}
      </p>
      <p className="text-xs text-neutral-500">{session.duration} min</p>

      <div className="absolute right-3 top-3">
        <button
          onClick={() => onReserve(session.id)}
          disabled={disableButton}
          aria-busy={pending}
          className={buttonClass}
        >
          {pending ? "Reservando..." : "Reservar"}
        </button>
      </div>

      <div className="mt-3">
        {soldOut ? (
          <span className="badge-red">Completo</span>
        ) : (
          <span className="badge-green">{spots} lugares</span>
        )}
      </div>

      {disabledForWindow && unlockLabel && (
        <p className="mt-3 text-xs text-stone-600">
          Disponible para reservar desde {unlockLabel}.
        </p>
      )}
    </div>
  );
}
