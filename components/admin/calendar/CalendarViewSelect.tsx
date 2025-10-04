"use client";

import { useRouter } from "next/router";
import { useCallback } from "react";

type CalendarViewSelectProps = {
  mode: "week" | "day";
  dateISO: string;
};

export default function CalendarViewSelect({ mode, dateISO }: CalendarViewSelectProps) {
  const router = useRouter();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as "week" | "day";
      const query = dateISO ? { date: dateISO } : undefined;
      router.push({ pathname: `/admin/calendar/${next}`, query });
    },
    [router, dateISO]
  );

  return (
    <select
      value={mode}
      onChange={handleChange}
      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="week">Semana</option>
      <option value="day">Día</option>
    </select>
  );
}
