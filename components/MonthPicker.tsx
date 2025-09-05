import { MONTH_LONG_ES, saturdayOfWeek } from "@/lib/date-mx";
import dayjs from "dayjs";

export default function MonthPicker({
  anchor, onMonthChange
}:{
  anchor: string;                           // cualquier día dentro de la semana visible
  onMonthChange: (firstDayIso:string)=>void // recibe ISO del 1er día del mes elegido
}) {
  const now = dayjs();
  const options = Array.from({ length: 12 }, (_, i) => {
    const m = now.add(i, "month");
    return { value: m.format("YYYY-MM"), label: `${MONTH_LONG_ES[m.month()]} ${m.year()}` };
  });

  // Valor mostrado: MES del SÁBADO de la semana visible
  const sat = saturdayOfWeek(anchor);
  const value = sat.format("YYYY-MM");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [y, m] = e.target.value.split("-").map(Number);
    const first = dayjs().year(y).month(m - 1).date(1).format("YYYY-MM-DD");
    onMonthChange(first);
  };

  return (
    <select value={value} onChange={handleChange}
      className="h-10 rounded-xl border px-3 text-sm font-semibold tracking-wide">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
