import type { AdminNavKey } from "@/types/admin-nav";

export type AdminRole = "INSTRUCTOR" | "RECEPTIONIST" | "LOCATION_MANAGER" | "MASTER" | "SUPPORT";

export const ADMIN_ROLES: readonly AdminRole[] = [
  "INSTRUCTOR",
  "RECEPTIONIST",
  "LOCATION_MANAGER",
  "MASTER",
  "SUPPORT",
] as const;

export type AccessLevel = "NONE" | "READ" | "EDIT" | "FULL";

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  NONE: "Sin acceso",
  READ: "Lectura",
  EDIT: "Edición",
  FULL: "Total",
};

export const ACCESS_LEVEL_ORDER: Record<AccessLevel, number> = {
  NONE: 0,
  READ: 1,
  EDIT: 2,
  FULL: 3,
};

export function isAccessLevelSufficient(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_LEVEL_ORDER[level] >= ACCESS_LEVEL_ORDER[required];
}

export type AdminFeatureKey =
  | "dashboard"
  | "attendance"
  | "calendarOverview"
  | "calendarDay"
  | "calendarWeek"
  | "reports"
  | "classTypes"
  | "courses"
  | "courseScheduler"
  | "classes"
  | "members"
  | "memberNew"
  | "memberDetail"
  | "membershipTypes"
  | "membershipPlans"
  | "planningInstructors"
  | "planningRooms"
  | "planningStaff"
  | "planningSettings"
  | "instructorApp";

type FeatureConfig = {
  path: string;
  label: string;
  navKey?: AdminNavKey;
  accessByRole: Record<AdminRole, AccessLevel>;
};

const READ = "READ";
const EDIT = "EDIT";
const FULL = "FULL";
const NONE = "NONE";

const calendarAccess = {
  INSTRUCTOR: READ,
  RECEPTIONIST: EDIT,
  LOCATION_MANAGER: FULL,
  MASTER: FULL,
  SUPPORT: FULL,
} satisfies Record<AdminRole, AccessLevel>;

export const ADMIN_FEATURES: Record<AdminFeatureKey, FeatureConfig> = {
  dashboard: {
    path: "/admin",
    label: "Panel principal",
    navKey: "dashboard",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: NONE,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  attendance: {
    path: "/admin/attendance",
    label: "Control de asistencias",
    navKey: "attendanceScanner",
    accessByRole: {
      INSTRUCTOR: EDIT,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  calendarOverview: {
    path: "/admin/calendar",
    label: "Calendario (vista general)",
    navKey: "calendar",
    accessByRole: calendarAccess,
  },
  calendarDay: {
    path: "/admin/calendar/day",
    label: "Calendario por día",
    accessByRole: calendarAccess,
  },
  calendarWeek: {
    path: "/admin/calendar/week",
    label: "Calendario por semana",
    accessByRole: calendarAccess,
  },
  reports: {
    path: "/admin/reports",
    label: "Reportes y métricas",
    navKey: "reports",
    accessByRole: {
      INSTRUCTOR: READ,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: READ,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  classTypes: {
    path: "/admin/class-types",
    label: "Catálogo de tipos de clase",
    navKey: "classTypes",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: READ,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  courses: {
    path: "/admin/courses",
    label: "Horarios (Cursos)",
    navKey: "courses",
    accessByRole: {
      INSTRUCTOR: READ,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  courseScheduler: {
    path: "/admin/courses/scheduler",
    label: "Programador de cursos",
    navKey: "courseScheduler",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  classes: {
    path: "/admin/classes",
    label: "Sesiones planeadas",
    navKey: "classes",
    accessByRole: {
      INSTRUCTOR: READ,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  members: {
    path: "/admin/members",
    label: "Gestión de miembros",
    navKey: "members",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  memberNew: {
    path: "/admin/members/new",
    label: "Alta rápida de miembro",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  memberDetail: {
    path: "/admin/members/[id]",
    label: "Detalle/edición de miembro",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  membershipTypes: {
    path: "/admin/membership-types",
    label: "Tipos de membresía",
    navKey: "membershipTypes",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: EDIT,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  membershipPlans: {
    path: "/admin/memberships",
    label: "Planes activos",
    navKey: "membershipPlans",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: READ,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  planningInstructors: {
    path: "/admin/planeacion/instructores",
    label: "Planeación de instructores",
    navKey: "planningInstructors",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: EDIT,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  planningRooms: {
    path: "/admin/planeacion/salas",
    label: "Planeación de salas",
    navKey: "planningRooms",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: EDIT,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  planningStaff: {
    path: "/admin/planeacion/staff",
    label: "Gestión de staff",
    navKey: "planningStaff",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: NONE,
      LOCATION_MANAGER: EDIT,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  planningSettings: {
    path: "/admin/planeacion/settings",
    label: "Parámetros de planeación",
    navKey: "settings",
    accessByRole: {
      INSTRUCTOR: NONE,
      RECEPTIONIST: NONE,
      LOCATION_MANAGER: NONE,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
  instructorApp: {
    path: "/instructor",
    label: "App de instructores",
    navKey: "instructorApp",
    accessByRole: {
      INSTRUCTOR: EDIT,
      RECEPTIONIST: READ,
      LOCATION_MANAGER: FULL,
      MASTER: FULL,
      SUPPORT: FULL,
    },
  },
};

export const NAV_FEATURE_BY_KEY: Partial<Record<AdminNavKey, AdminFeatureKey>> = {};

export const FEATURE_BY_PATH = new Map<string, AdminFeatureKey>();

for (const [key, config] of Object.entries(ADMIN_FEATURES) as [AdminFeatureKey, FeatureConfig][]) {
  if (config.navKey) {
    NAV_FEATURE_BY_KEY[config.navKey] = key;
  }
  FEATURE_BY_PATH.set(config.path, key);
}

export function normalizeAdminRole(role: string | null | undefined): AdminRole | null {
  if (!role) return null;
  const normalized = role.trim().toUpperCase();
  return (ADMIN_ROLES.find((entry) => entry === normalized) ?? null) as AdminRole | null;
}

export function getAccessLevelForRole(
  role: string | null | undefined,
  feature: AdminFeatureKey
): AccessLevel {
  const normalizedRole = normalizeAdminRole(role);
  if (!normalizedRole) return "NONE";
  const config = ADMIN_FEATURES[feature];
  if (!config) return "NONE";
  return config.accessByRole[normalizedRole] ?? "NONE";
}

export function getAccessBooleans(role: string | null | undefined, feature: AdminFeatureKey) {
  const level = getAccessLevelForRole(role, feature);
  return {
    level,
    canView: level !== "NONE",
    canEdit: level === "EDIT" || level === "FULL",
    canDelete: level === "FULL",
  };
}
