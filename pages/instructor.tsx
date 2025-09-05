import { useEffect, useState } from "react";

export default function InstructorBoard() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState<any[]>([]);

  useEffect(()=>{
    fetch(`/api/occupancy?date=${date}`).then(r=>r.json()).then(setRows);
  }, [date]);

  return (
    <section className="pt-6 space-y-3">
      <h2 className="text-2xl font-bold">Ocupación</h2>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-xl px-3 py-2" />
      {rows.map(row=>(
        <div key={row.id} className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-500">{row.time} • {row.room}</div>
              <h3 className="font-semibold">{row.classType}</h3>
            </div>
            <p className="text-sm">Cupo: <b>{row.occupancy}/{row.capacity}</b></p>
          </div>
          <ul className="mt-3 text-sm text-neutral-700 space-y-1">
            {row.attendees.map((a:any)=>(
              <li key={a.id} className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className={`badge ${a.status==="CHECKED_IN"?"badge-green":"bg-neutral-100 text-neutral-600"}`}>
                  {a.status==="CHECKED_IN"?"En sala":"Pendiente"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
