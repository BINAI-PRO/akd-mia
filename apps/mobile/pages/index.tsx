import Link from "next/link";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";
import Image from "next/image";

const mockStats = {
  sessionsCompleted: 72,
  totalHours: 51.5,
  streakDays: 12,
  nextClass: "Jue 7:00 PM",
};

const achievements = [
  {
    title: "Reformer Rookie",
    subtitle: "10 sesiones",
    icon: "🤸",
    color: "from-emerald-100 to-emerald-50 border-emerald-200 text-emerald-700",
  },
  {
    title: "Matwork Lover",
    subtitle: "25 sesiones",
    icon: "🧘",
    color: "from-sky-100 to-sky-50 border-sky-200 text-sky-700",
  },
  {
    title: "Evento especial",
    subtitle: "Masterclass",
    icon: "🎖️",
    color: "from-amber-100 to-amber-50 border-amber-200 text-amber-700",
  },
];

const weeklyProgress = [
  { label: "wk 1", value: 4 },
  { label: "wk 2", value: 6 },
  { label: "wk 3", value: 8 },
  { label: "wk 4", value: 6 },
  { label: "wk 5", value: 10 },
];

export default function Home() {
  const { profile, user } = useAuth();

  const displayName =
    profile?.fullName?.trim() ??
    profile?.email ??
    user?.email ??
    "Bienvenido";

  const firstName = displayName.split(" ")[0]?.trim() ?? displayName;
  const avatarUrl = profile?.avatarUrl ?? null;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "AT";

  return (
    <section className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-50">
      <div className="relative mx-auto flex w-full max-w-md flex-col gap-6 px-3 pb-8 pt-6 text-slate-50">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <Img
                src={avatarUrl}
                alt={displayName}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full border-2 border-white/60 object-cover shadow-md"
                unoptimized
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-white/60 bg-white/20 text-lg font-semibold shadow-md backdrop-blur">
                {initials}
              </span>
            )}
            <div>
              <p className="text-xs text-slate-200">Progreso</p>
              <h1 className="text-xl font-semibold">Hola{firstName ? `, ${firstName}` : ""}</h1>
            </div>
          </div>
          <button
            type="button"
            aria-label="Ayuda"
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/90 p-3 shadow-lg hover:bg-white"
          >
            <Image src="/ai_help.png" alt="Ayuda" width={32} height={32} className="h-8 w-8" />
          </button>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <StatPill label="Sesiones" value={mockStats.sessionsCompleted} />
          <StatPill label="Horas" value={mockStats.totalHours} />
          <StatPill label="Racha" value={`${mockStats.streakDays}d`} />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/90 shadow-lg backdrop-blur">
          <div>
            <p className="text-xs text-white/70">Proxima clase</p>
            <p className="font-semibold">Reformer intermedio</p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
            {mockStats.nextClass}
          </span>
        </div>
      </div>

      <div className="mx-auto -mt-6 w-full max-w-md space-y-6 px-3 pb-16">
        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Insignias</p>
              <h2 className="text-lg font-semibold text-slate-900">Lo que has ganado</h2>
            </div>
            <Link href="#" className="text-xs font-semibold text-brand-600">
              Ver todo
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {achievements.map((badge) => (
              <div
                key={badge.title}
                className={`rounded-xl border bg-gradient-to-b p-3 text-center shadow-sm ${badge.color}`}
              >
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-lg">
                  {badge.icon}
                </div>
                <p className="text-xs font-semibold">{badge.title}</p>
                <p className="text-[11px] text-slate-600">{badge.subtitle}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Actividad</p>
              <h2 className="text-lg font-semibold text-slate-900">Ultimas semanas</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Total: 34 h
            </span>
          </div>
          <div className="flex items-end justify-between gap-2">
            {weeklyProgress.map((week) => {
              const percent = Math.min(week.value / 10, 1);
              return (
                <div key={week.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end rounded-lg bg-slate-100 px-2 pb-2">
                    <div
                      className="w-full rounded-md bg-gradient-to-t from-brand-600 to-brand-400 transition"
                      style={{ height: `${Math.max(percent * 100, 8)}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-semibold text-slate-600">{week.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Acciones rapidas</p>
              <h2 className="text-lg font-semibold text-slate-900">Siguiente paso</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Nivel actual: Intermedio
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              href="/schedule"
              className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand-700 shadow-sm"
            >
              Reservar sesion
            </Link>
            <Link
              href="/my/progress"
              className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 shadow-sm"
            >
              Ver progreso
            </Link>
          </div>
        </section>

        <div className="pt-2 pb-6">
          <MobileFooterAttribution />
        </div>
      </div>
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-center shadow-lg backdrop-blur">
      <p className="text-xs text-white/70">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MobileFooterAttribution() {
  return (
    <div className="flex items-center justify-center text-[10px] text-white/80 drop-shadow">
      <a
        href="https://binai.pro"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 transition hover:text-white"
      >
        <span>Desarrollado por :</span>
        <Image src="/logo_binai.png" alt="Logo BinAI" width={96} height={28} className="h-5 w-auto" />
      </a>
    </div>
  );
}
