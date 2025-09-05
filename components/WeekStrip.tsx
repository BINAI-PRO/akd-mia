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

  return (
    <div className="flex items-center gap-[4px]">
      {/* Flecha izquierda: sin fondo, margen lateral ~20% del anterior */}
      <button
        aria-label="Semana anterior"
        disabled={!canPrev}
        onClick={()=>onWeekShift(-1)}
        className={`mx-[2px] p-0 ${!canPrev ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <path d="M14 7l-5 5 5 5M18 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      </button>

      <div className="flex gap-[4px]">
        {days.map(d => {
          const dt = dayjs(d);
          const isSel = d === selected;
          const isPast = d < today; // no seleccionable si es pasado
          const mon   = MONTH_ABBR_ES[dt.month()];
          const dayNum= dt.date();
          const dow   = DOW_ABBR_ES[dt.day()];

          const base      = "w-[48px] rounded-xl border px-1 py-2 text-center select-none"; // ~70% del ancho anterior
          const active    = isSel ? "bg-brand-500 text-white border-brand-500"
                                  : "bg-white text-neutral-700 border-[#3672A8]";
          const disabled  = "bg-white text-[#D1D1D1] border-[#D9D9D9] cursor-not-allowed";

          return (
            <button key={d}
              onClick={()=>!isPast && onSelect(d)}
              disabled={isPast}
              className={`${base} ${isPast ? disabled : active}`}>
              <div className="text-[10px] leading-none">{mon}</div>
              <div className="text-base font-bold leading-tight">{dayNum}</div>
              <div className="text-[10px] leading-none">{dow}</div>
            </button>
          );
        })}
      </div>

      {/* Flecha derecha: sin fondo, margen lateral ~20% del anterior */}
      <button
        aria-label="Semana siguiente"
        disabled={!canNext}
        onClick={()=>onWeekShift(1)}
        className={`mx-[2px] p-0 ${!canNext ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <path d="M10 7l5 5-5 5M6 7l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      </button>
    </div>
  );
}
