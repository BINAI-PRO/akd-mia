import Link from "next/link";
import Img from "@/components/Img";

export default function Home() {
  return (
    <section className="pt-8 px-4">
      <div className="max-w-md mx-auto flex flex-col items-center text-center gap-4">
        <Img src="/angie.jpg" alt="Angie" width={112} height={112} className="w-28 h-28 rounded-full object-cover shadow" />
        <h1 className="text-2xl font-bold">Bienvenida, Angie</h1>
        <p className="text-neutral-500">Reserva y gestiona tus sesiones en un solo lugar.</p>

        <div className="h-2" />
        <Link href="/schedule" className="btn">Ir a Reservas</Link>
      </div>
      <div className="h-20" />
    </section>
  );
}


