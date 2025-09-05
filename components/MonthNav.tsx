import dayjs from "dayjs";

export default function MonthNav({
  date, onChange, onToday, onNextDays
}: { date: string; onChange: (iso:string)=>void; onToday: ()=>void; onNextDays: (n:number)=>void; }) {
  const d = dayjs(date);
  const go = (delta:number) => onChange(d.add(delta, "month").startOf("month").format("YYYY-MM-DD"));

  const months = Array.from({length:12}, (_,i)=> dayjs().month(i).format("MMMM"));
  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = months.findIndex(mn => mn === e.target.value);
    onChange(d.month(m).startOf("month").format("YYYY-MM-DD"));
  };


  return (
    <div className="flex items-center gap-2">
      {/* Flecha mes anterior */}
      <button aria-label="Prev month" onClick={()=>go(-1)} className="rounded-full border px-2 py-2">
        <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
      </button>

      <select value={d.format("MMMM")} onChange={onSelect}
        className="rounded-xl border px-3 py-2 text-sm font-medium capitalize">
        {months.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
      </select>

      <span className="text-sm font-medium">{d.format("YYYY")}</span>

      {/* -5 días (izquierda) */}
      <button onClick={()=>onNextDays(-5)} className="ml-auto rounded-full border px-3 py-2 text-sm">−5</button>

      <button onClick={onToday} className="rounded-xl border px-3 py-2 text-sm">Today</button>

      {/* +5 días (derecha) */}
      <button onClick={()=>onNextDays(5)} className="rounded-full border px-3 py-2 text-sm">+5</button>

      {/* Flecha mes siguiente */}
      <button aria-label="Next month" onClick={()=>go(1)} className="rounded-full border px-2 py-2">
        <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
      </button>
    </div>
  );

}
