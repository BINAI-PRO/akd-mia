"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import Img from "@/components/Img";
import { useAuth } from "@/components/auth/AuthContext";

export type NavKey =
  | "dashboard"
  | "calendar"
  | "reports"
  | "attendanceScanner"
  | "courses"
  | "courseScheduler"
  | "classTypes"
  | "classes"
  | "appointments"
  | "videos"
  | "members"
  | "membershipTypes"
  | "membershipPlans"
  | "planningInstructors"
  | "planningRooms"
  | "planningStaff"
  | "contacts"
  | "marketing"
  | "analytics"
  | "settings";

type AdminLayoutProps = {
  title: string;
  active: NavKey;
  headerToolbar?: ReactNode;
  children: ReactNode;
};

type NavLink = {
  type: "link";
  key: NavKey;
  label: string;
  icon: string;
  href: string;
};

type NavGroup = {
  type: "group";
  key: string;
  label: string;
  icon: string;
  children: NavLink[];
};

type NavItem = NavLink | NavGroup;

const NAVIGATION: NavItem[] = [
  { type: "link", key: "dashboard", label: "Inicio", icon: "home", href: "/" },
  { type: "link", key: "calendar", label: "Calendario", icon: "calendar_today", href: "/calendar/day" },
  {
    type: "group",
    key: "products",
    label: "Planeacion",
    icon: "edit_calendar",
    children: [
      { type: "link", key: "classTypes", label: "Clases", icon: "category", href: "/class-types" },
      { type: "link", key: "courses", label: "Horarios", icon: "school", href: "/courses" },
      { type: "link", key: "courseScheduler", label: "Programador", icon: "calendar_view_week", href: "/courses/scheduler" },
      { type: "link", key: "classes", label: "Sesiónes", icon: "event", href: "/classes" },
    ],
  },
  {
    type: "group",
    key: "memberships",
    label: "Membresías",
    icon: "card_membership",
    children: [
      { type: "link", key: "members", label: "Miembros", icon: "people", href: "/members" },
      { type: "link", key: "membershipTypes", label: "Tipos de membresía", icon: "badge", href: "/membership-types" },
      { type: "link", key: "membershipPlans", label: "Planes", icon: "workspace_premium", href: "/memberships" },
    ],
  },
  {
    type: "group",
    key: "planning",
    label: "Recursos",
    icon: "extension",
    children: [
      { type: "link", key: "planningInstructors", label: "Instructores", icon: "self_improvement", href: "/planeacion/instructores" },
      { type: "link", key: "planningRooms", label: "Salas", icon: "meeting_room", href: "/planeacion/salas" },
      { type: "link", key: "planningStaff", label: "Staff", icon: "group", href: "/planeacion/staff" },
      { type: "link", key: "settings", label: "Configuracion", icon: "schedule", href: "/planeacion/settings" },
    ],
  },
  { type: "link", key: "reports", label: "Reportes", icon: "insights", href: "/reports" },
  { type: "link", key: "attendanceScanner", label: "Asistencia", icon: "qr_code_scanner", href: "/attendance" },
];

const ROLE_NAV_CONFIG: Record<string, "ALL" | NavKey[]> = {
  MASTER: "ALL",
  LOCATION_MANAGER: [
    "dashboard",
    "calendar",
    "reports",
    "attendanceScanner",
    "courses",
    "courseScheduler",
    "classTypes",
    "classes",
    "members",
    "membershipTypes",
    "membershipPlans",
    "planningInstructors",
    "planningRooms",
    "planningStaff",
  ],
  SUPPORT: [
    "dashboard",
    "calendar",
    "reports",
    "attendanceScanner",
    "courses",
    "courseScheduler",
    "classTypes",
    "classes",
    "members",
    "membershipTypes",
    "membershipPlans",
    "planningInstructors",
    "planningRooms",
    "planningStaff",
  ],
  RECEPTIONIST: ["dashboard", "calendar", "reports", "attendanceScanner", "classes", "members", "membershipPlans"],
  INSTRUCTOR: ["calendar"],
};

function filterNavigation(role: string | null | undefined): NavItem[] {
  const config = role ? ROLE_NAV_CONFIG[role] : "ALL";
  if (!role || config === "ALL") {
    return NAVIGATION;
  }

  const allowed = new Set(config);

  return NAVIGATION.reduce<NavItem[]>((acc, item) => {
    if (item.type === "link") {
      if (allowed.has(item.key)) acc.push(item);
      return acc;
    }

    const children = item.children.filter((child) => allowed.has(child.key));
    if (children.length > 0) {
      acc.push({ ...item, children });
    }
    return acc;
  }, []);
}

export default function AdminLayout({ title, active, headerToolbar, children }: AdminLayoutProps) {
  const router = useRouter();
  const { profile, profileLoading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredNavigation = useMemo(() => filterNavigation(profile?.role), [profile?.role]);

  const initialOpenGroups = useMemo(() => {
    const groups = new Set<string>();
    filteredNavigation.forEach((item) => {
      if (item.type === "group" && item.children.some((child) => child.key === active)) {
        groups.add(item.key);
      }
    });
    return groups;
  }, [filteredNavigation, active]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpenGroups);

  useEffect(() => {
    setOpenGroups(initialOpenGroups);
  }, [initialOpenGroups]);

  const displayName = useMemo(() => {
    if (profile?.fullName) return profile.fullName;
    if (profile?.email) return profile.email;
    return "Usuario";
  }, [profile?.email, profile?.fullName]);

  const avatarUrl = profile?.avatarUrl ?? null;
  const initials = useMemo(() => {
    return displayName
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [displayName]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    await router.replace("/login");
  }, [router, signOut]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderLink = (link: NavLink) => {
    const isActive = link.key === active;
    const className = [
      "flex items-center rounded-lg px-4 py-2 text-sm transition",
      isActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600 hover:bg-slate-100",
    ].join(" ");

    return (
      <Link key={link.key} href={link.href} className={className} onClick={() => setMobileOpen(false)}>
        <span className="material-icons-outlined mr-3 text-lg" aria-hidden="true">
          {link.icon}
        </span>
        {link.label}
      </Link>
    );
  };

  const renderNav = (isMobile = false) => (
    <nav className={`flex-1 space-y-1 ${isMobile ? "p-3" : "p-4"}`}>
      {filteredNavigation.map((item) => {
        if (item.type === "link") {
          return renderLink(item);
        }

        const isExpanded = openGroups.has(item.key);
        const containsActive = item.children.some((child) => child.key === active);

        return (
          <div key={item.key} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(item.key)}
              className={`flex w-full items-center justify-between rounded-lg px-4 py-2 text-sm transition ${
                containsActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="flex items-center">
                <span className="material-icons-outlined mr-3 text-lg" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </span>
              <span
                className={`material-icons-outlined text-lg transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
            <div className={`${isExpanded ? "block" : "hidden"} space-y-1 pl-8`}>
              {item.children.map((child) => renderLink(child))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const BrandBlock = () => (
    <div className="flex items-center gap-3">
      <Img src="/logo.webp" alt="AT Pilates Time" width={160} height={40} className="h-10 w-auto" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-800">AT Pilates Time</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">ATP Tu Fit App</p>
      </div>
    </div>
  );

  const UserBadge = () => (
    <div className="flex items-center gap-3 rounded-full border border-slate-200 px-3 py-1">
      {avatarUrl ? (
        <Img src={avatarUrl} alt={displayName} width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initials || "U"}
        </span>
      )}
      <div className="flex flex-col text-right">
        <span className="text-sm font-semibold leading-tight text-slate-800">{displayName}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
          disabled={profileLoading}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex h-screen">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="flex h-16 items-center justify-start border-b border-slate-200 px-6">
            <BrandBlock />
          </div>
          {renderNav()}
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
            <aside className="relative ml-auto flex h-full w-64 flex-col border-l border-slate-200 bg-white shadow-xl">
              <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
                <BrandBlock />
                <button
                  type="button"
                  className="ml-2 rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar menu"
                >
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
              {renderNav(true)}
            </aside>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="rounded-md border border-slate-200 p-2 text-slate-600 md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
              >
                <span className="material-icons-outlined">menu</span>
              </button>
              <h1 className="text-2xl font-semibold">{title}</h1>
            </div>
            <div className="flex items-center gap-4">
              {headerToolbar}
              <UserBadge />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-slate-100 p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

