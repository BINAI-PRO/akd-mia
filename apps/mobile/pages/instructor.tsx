import { useEffect, useState } from "react";

type AttendeeStatus = "CONFIRMED" | "CHECKED_IN" | "CANCELLED";
type Attendee = { id: string; name: string; status: AttendeeStatus };
type OccupancyRow = {
  id: string;
  classType: string;
  time: string;
  room: string;
  capacity: number;
  occupancy: number;
  attendees: Attendee[];
};

export default function InstructorBoard() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<OccupancyRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/occupancy?date=${date}`)
      .then((response) => response.json() as Promise<OccupancyRow[]>)
      .then((payload) => {
        if (!cancelled) setRows(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <section className="space-y-3 pt-6">
      <h2 className="text-2xl font-bold">OcupaciA3n</h2>
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="rounded-xl border px-3 py-2"
      />
      {rows.map((row) => (
        <div key={row.id} className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-500">
                {row.time} ??? {row.room}
              </div>
              <h3 className="font-semibold">{row.classType}</h3>
            </div>
            <p className="text-sm">
              Cupo: <b>{row.occupancy}/{row.capacity}</b>
            </p>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-neutral-700">
            {row.attendees.map((attendee) => (
              <li key={attendee.id} className="flex items-center justify-between">
                <span>{attendee.name}</span>
                <span
                  className={`badge ${
                    attendee.status === "CHECKED_IN" ? "badge-green" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {attendee.status === "CHECKED_IN" ? "En sala" : "Pendiente"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
