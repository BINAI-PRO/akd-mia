export default function SessionCard({ s, onReserve }:{ s:any; onReserve:(id:string)=>void }) {
  const spots = s.capacity - s.current_occupancy;
  const soldOut = spots <= 0;
  return (
    <div className="relative card p-4">
      <div className="text-sm text-neutral-500">{s.startLabel}</div>
      <h3 className="font-semibold">{s.classType}</h3>
      <p className="text-sm text-neutral-500">{s.instructor} • {s.room}</p>
      <p className="text-xs text-neutral-500">{s.duration} min</p>

      <div className="absolute right-3 top-3">
        {soldOut
          ? <button disabled className="rounded-full px-4 py-2 border text-neutral-400 bg-white">Reservar</button>
          : <button onClick={()=>onReserve(s.id)} className="rounded-full px-4 py-2 bg-brand-500 text-white shadow hover:bg-brand-600">Reservar</button>}
      </div>

      <div className="mt-3">
        {soldOut ? <span className="badge-red">Completo</span>
                 : <span className="badge-green">{spots} lugares</span>}
      </div>
    </div>
  );
}
