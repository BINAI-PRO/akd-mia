import Img from "@/components/Img";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-neutral-100">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
        <Img
          src="/logo.png"
          alt="AT"
          width={34}
          height={34}
          className="w-[34px] h-[34px] rounded-full shadow-none border-0"
        />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-none">AT Pilates Time</h1>
          <p className="text-xs text-neutral-500 leading-none">ATA�P Tu Fit App</p>
        </div>

        {/* Usuario (mock) */}
        <div className="ml-auto flex items-center gap-2">
          <Img
            src="/angie.jpg"
            alt="Angie"
            width={36}
            height={36}
            className="w-9 h-9 rounded-full object-cover shadow"
          />
          <span className="text-sm font-semibold">Angie</span>
        </div>
      </div>
    </header>
  );
}
