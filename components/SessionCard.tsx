import { madridDayjs } from "@/lib/timezone";

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
  waitlistCount: number;
  waitlistEntryId: string | null;
  waitlistStatus: "PENDING" | "PROMOTED" | "CANCELLED" | null;
  waitlistPosition: number | null;
  _waitlistBusy?: "join" | "leave" | null;
};

type SessionCardProps = {
  session: SessionSummary & { _pending?: boolean };
  onReserve: (id: string) => void;
  mode?: "reserve" | "rebook";
  onJoinWaitlist?: (id: string) => void;
  onLeaveWaitlist?: (id: string) => void;
};

export default function SessionCard({
  session,
  onReserve,
  mode = "reserve",
  onJoinWaitlist,
  onLeaveWaitlist,
}: SessionCardProps) {
  const spots = session.capacity - session.current_occupancy;
  const soldOut = spots <= 0;
  const pending = !!session._pending;
  const canBook = session.canBook;
  const unlockLabel =
    session.availableFromLabel ??
    (session.availableFrom ? madridDayjs(session.availableFrom).format("DD/MM/YYYY") : undefined);
  const disabledForWindow = !soldOut && !canBook;

  const disableButton = soldOut || pending || disabledForWindow;

  const buttonClass = disableButton
    ? "rounded-full bg-brand-200 px-4 py-2 text-white/80 shadow cursor-not-allowed"
    : "rounded-full bg-brand-500 px-4 py-2 text-white shadow transition hover:bg-brand-600";

  const buttonLabel = pending
    ? mode === "rebook"
      ? "Reprogramando..."
      : "Reservando..."
    : mode === "rebook"
    ? "Seleccionar"
    : "Reservar";

  const waitlistCount = session.waitlistCount ?? 0;
  const waitlistStatus = session.waitlistStatus ?? null;
  const waitlistPosition = session.waitlistPosition ?? null;
  const waitlistBusy = session._waitlistBusy ?? null;
  const isOnWaitlist = waitlistStatus === "PENDING";
  const isPromoted = waitlistStatus === "PROMOTED";
  const joinDisabled = waitlistBusy === "join" || !onJoinWaitlist;
  const leaveDisabled = waitlistBusy === "leave" || !onLeaveWaitlist;

  const joinLabel =
    waitlistBusy === "join"
      ? "Uni�ndose..."
      : waitlistCount > 0
      ? `Unirse a la lista (${waitlistCount})`
      : "Unirse a la lista de espera";

  const leaveLabel = waitlistBusy === "leave" ? "Saliendo..." : "Salir de la lista";

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
          {buttonLabel}
        </button>
      </div>

      <div className="mt-3">
        {soldOut ? (
          <>
            <span className="badge-red">Completo</span>
            <div className="mt-3 space-y-2">
              {isOnWaitlist ? (
                <>
                  <p className="text-xs text-brand-700">
                    Est�s en la lista de espera{waitlistPosition ? ` (posici�n ${waitlistPosition})` : ""}.
                  </p>
                  <button
                    type="button"
                    onClick={() => onLeaveWaitlist?.(session.id)}
                    disabled={leaveDisabled}
                    className="w-full rounded-full border border-brand-200 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                  >
                    {leaveLabel}
                  </button>
                </>
              ) : isPromoted ? (
                <p className="text-xs text-green-700">
                  �Liberamos un lugar para ti! Revisa tus reservas para confirmar tu acceso.
                </p>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    Lista de espera: {waitlistCount} {waitlistCount === 1 ? "persona" : "personas"}.
                  </p>
                  <button
                    type="button"
                    onClick={() => onJoinWaitlist?.(session.id)}
                    disabled={joinDisabled}
                    className="w-full rounded-full border border-brand-200 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                  >
                    {joinLabel}
                  </button>
                </>
              )}
            </div>
          </>
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



