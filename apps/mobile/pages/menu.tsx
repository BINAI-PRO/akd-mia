import Img from "@/components/Img";

export default function MenuPage() {
  return (
    <section className="pt-6 px-4 pb-24">
      <h2 className="text-2xl font-bold">MenA�</h2>
      <div className="mx-auto max-w-md">
        <div className="min-h-[60vh] grid place-items-center">
          <Img src="/dev-binai.jpg" alt="En desarrollo" width={320} height={240} className="w-full max-w-[320px] h-auto" />
        </div>
      </div>
    </section>
  );
}
