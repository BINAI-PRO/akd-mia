import { useRef } from "react";
import { DOW_ABBR_ES, MONTH_ABBR_ES, weekDaysMX, earliestAnchor, latestAnchor } from "@/lib/date-mx";
import dayjs from "dayjs";

export default function WeekStrip({
  anchor, selected, onSelect, onWeekShift
}:{
  anchor: string;
  selected: string;
  onSelect: (iso:string)=>void;
  onWeekShift: (deltaWeeks:number)=>void;
}) {
  const days = weekDaysMX(anchor);
  const today = dayjs().format("YYYY-MM-DD");

  const canPrev = dayjs(anchor).isAfter(dayjs(earliestAnchor()));
  const canNext = dayjs(anchor).isBefore(dayjs(latestAnchor()));
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const deltaX = event.changedTouches[0]?.clientX - touchStartX.current;
    touchStartX.current = null;
    const threshold = 40;
    if (deltaX > threshold && canPrev) onWeekShift(-1);
    if (deltaX < -threshold && canNext) onWeekShift(1);
  };

  return (
    <div
      className="flex w-full items-center justify-between gap-2 px-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        aria-label="Semana anterior"
        disabled={!canPrev}
        onClick={() => onWeekShift(-1)}
        className={`p-1 flex-shrink-0 ${!canPrev ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-6">
          <path d="M14 7l-5 5 5 5M18 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>

      <div className="flex flex-1 items-center justify-center gap-[3.5px] overflow-x-auto no-scrollbar px-1">
        {days.map((d) => {
          const dt = dayjs(d);
          const isSel = d === selected;
          const isPast = d < today;
          const mon = MONTH_ABBR_ES[dt.month()];
          const dayNum = dt.date();
          const dow = DOW_ABBR_ES[dt.day()];

          const base = "min-w-[40px] rounded-xl border px-1.5 py-2 text-center select-none";
          const active = isSel
            ? "bg-brand-500 text-white border-brand-500"
            : "bg-white text-neutral-700 border-[#3672A8]";
          const disabled = "bg-white text-[#D1D1D1] border-[#D9D9D9] cursor-not-allowed";

          return (
            <button
              key={d}
              onClick={() => !isPast && onSelect(d)}
              disabled={isPast}
              className={`${base} ${isPast ? disabled : active}`}
            >
              <div className="text-[9px] leading-none">{mon}</div>
              <div className="text-sm font-bold leading-tight">{dayNum}</div>
              <div className="text-[9px] leading-none">{dow}</div>
            </button>
          );
        })}
      </div>

      <button
        aria-label="Semana siguiente"
        disabled={!canNext}
        onClick={() => onWeekShift(1)}
        className={`p-1 ${!canNext ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-6">
          <path d="M10 7l5 5-5 5M6 7l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>
    </div>
  );
}
