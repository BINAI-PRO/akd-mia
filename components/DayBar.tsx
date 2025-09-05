import { formatSelectedBarMX, isTodayMX } from "@/lib/date-mx";

export default function DayBar({ iso }:{ iso:string }) {
  const label = formatSelectedBarMX(iso);
  const add = isTodayMX(iso) ? " (HOY)" : "";
  return (
    <div className="rounded-xl bg-brand-500/10 text-brand-700 font-semibold px-3 py-2 tracking-wide">
      {label}{add}
    </div>
  );
}
