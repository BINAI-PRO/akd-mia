export default function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-neutral-100">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
        <img src="/logo.png" alt="AT" className="w-[34px] h-[34px] rounded-full shadow-none border-0" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-none">AT Pilates Time</h1>
          <p className="text-xs text-neutral-500 leading-none">AT·P Tu Fit App</p>
        </div>

        {/* Usuario (mock) */}
        <div className="ml-auto flex items-center gap-2">
          <img src="/angie.jpg" alt="Angie" className="w-9 h-9 rounded-full object-cover shadow" />
          <span className="text-sm font-semibold">Angie</span>
        </div>
      </div>
    </header>
  );
}
