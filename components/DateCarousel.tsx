"use client";
import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";

export default function DateCarousel({ selected, onSelect }:{
  selected: string; onSelect: (iso:string)=>void;
}) {
  const days = useMemo(()=>{
    const arr:string[]=[]; const start = dayjs(selected).startOf("week");
    for (let i=0;i<7;i++) arr.push(start.add(i,"day").format("YYYY-MM-DD"));
    return arr;
  },[selected]);

  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{down:boolean; x:number; left:number}>({down:false,x:0,left:0});

  const onDown = (e: React.PointerEvent<HTMLDivElement>)=>{
    const el = ref.current!;
    setDrag({down:true, x:e.clientX, left:el.scrollLeft});
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>)=>{
    if(!drag.down) return;
    const el = ref.current!;
    const dx = e.clientX - drag.x;
    el.scrollLeft = drag.left - dx;
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>)=>{
    setDrag(d=>({...d, down:false}));
    ref.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
         className="flex gap-2 overflow-auto no-scrollbar py-2 cursor-grab active:cursor-grabbing select-none">
      {days.map(d=>{
        const isSel = d===selected; const wd = dayjs(d);
        return (
          <button key={d} onClick={()=>onSelect(d)}
            className={`px-3 py-2 rounded-xl border text-sm whitespace-nowrap
            ${isSel?"bg-brand-500 text-white border-brand-500":"bg-white border-neutral-200"}`}>
            <div className="font-semibold">{wd.format("ddd DD")}</div>
          </button>
        );
      })}
    </div>
  );
}
