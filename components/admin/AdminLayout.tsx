"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type NavKey =
  | "dashboard"
  | "calendar"
  | "courses"
  | "courseScheduler"
  | "classes"
  | "appointments"
  | "videos"
  | "members"
  | "membershipPlans"
  | "planningInstructors"
  | "planningRooms"
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
  { type: "link", key: "dashboard", label: "Inicio", icon: "home", href: "/admin" },
  { type: "link", key: "calendar", label: "Calendario", icon: "calendar_today", href: "/admin/calendar/day" },
  {
    type: "group",
    key: "products",
    label: "Productos",
    icon: "inventory_2",
    children: [
      { type: "link", key: "courses", label: "Cursos", icon: "school", href: "/admin/courses" },
      { type: "link", key: "courseScheduler", label: "Programador", icon: "calendar_view_week", href: "/admin/courses/scheduler" },
      { type: "link", key: "classes", label: "Clases", icon: "inventory_2", href: "/admin/classes" },
      // { type: "link", key: "appointments", label: "1:1 Appointments", icon: "event_available", href: "#" },
      // { type: "link", key: "videos", label: "Videos", icon: "movie", href: "#" },
    ],
  },
  {
    type: "group",
    key: "memberships",
    label: "Membresias",
    icon: "card_membership",
    children: [
      { type: "link", key: "members", label: "Miembros", icon: "people", href: "/admin/members" },
      { type: "link", key: "membershipPlans", label: "Planes", icon: "workspace_premium", href: "/admin/memberships" },
    ],
  },
  {
    type: "group",
    key: "planning",
    label: "Planeacion",
    icon: "dashboard_customize",
    children: [
      { type: "link", key: "planningInstructors", label: "Instructores", icon: "people", href: "/admin/planeacion/instructores" },
      { type: "link", key: "planningRooms", label: "Salas", icon: "meeting_room", href: "/admin/planeacion/salas" },
    ],
  },
  // { type: "link", key: "contacts", label: "Contacts", icon: "contacts", href: "#" },
  // { type: "link", key: "marketing", label: "Marketing", icon: "campaign", href: "#" },
  // { type: "link", key: "analytics", label: "Analytics", icon: "analytics", href: "#" },
  // { type: "link", key: "settings", label: "Settings", icon: "settings", href: "#" },
];

export default function AdminLayout({ title, active, headerToolbar, children }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const initialOpenGroups = useMemo(() => {
    const groups = new Set<string>();
    NAVIGATION.forEach((item) => {
      if (item.type === "group" && item.children.some((child) => child.key === active)) {
        groups.add(item.key);
      }
    });
    return groups;
  }, [active]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpenGroups);

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
      <Link
        key={link.key}
        href={link.href}
        className={className}
        onClick={() => setMobileOpen(false)}
      >
        <span className="material-icons-outlined mr-3 text-lg" aria-hidden="true">
          {link.icon}
        </span>
        {link.label}
      </Link>
    );
  };

  const renderNav = (isMobile = false) => (
    <nav className={`flex-1 space-y-1 ${isMobile ? "p-3" : "p-4"}`}>
      {NAVIGATION.map((item) => {
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
            <div className={`${isExpanded ? "block" : "hidden"} space-y-1 pl-8`}>{item.children.map((child) => renderLink(child))}</div>
          </div>
        );
      })}
    </nav>
  );

  const BrandBlock = () => (
    <div className="flex items-center gap-3">
      <img src="/logo.png" alt="AT Pilates Time" className="h-10 w-auto" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-800">AT Pilates Time</p>
        <p className="text-xs uppercase text-slate-500 tracking-wide">ATP Tu Fit App</p>
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
              {headerToolbar ?? (
                <>
                  <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notificaciones">
                    <span className="material-icons-outlined text-slate-500">notifications</span>
                  </button>
                  <img src="/angie.jpg" alt="Usuario" className="h-9 w-9 rounded-full object-cover" />
                </>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-slate-100 p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}



