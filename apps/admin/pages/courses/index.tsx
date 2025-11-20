import type { Tables } from "@/types/database";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import type { AdminFeatureKey } from "@/lib/admin-access";

// Bridge tipado por si AdminLayout requiere props adicionales
type AdminLayoutProps = PropsWithChildren<Record<string, unknown>>;
const AdminLayoutAny = AdminLayout as unknown as ComponentType<AdminLayoutProps>;

// === Tipos alineados al esquema real de Supabase ===
export type CourseEstado = "PUBLISHED" | "DRAFT" | "ARCHIVED";
export type CourseVisibilidad = "PUBLIC" | "PRIVATE";

type InstructorOption = {
  id: string;
  full_name: string;
};

type ClassTypeOption = {
  id: string;
  name: string;
  description?: string | null;
};

type RoomOption = {
  id: string;
  name: string;
};

type CourseQueryRow = Tables<"courses"> & {
  instructors?: { id: string; full_name: string | null } | null;
  class_types?: { id: string; name: string | null } | null;
  rooms?: { id: string; name: string | null } | null;
};

// Nombres de propiedades en espaÃ±ol para la UI, mapeados desde snake_case de la DB
export type CourseRow = {
  id: string;
  title: string;
  Descripcion: string | null; // description
  shortDescripcion: string | null; // short_description
  Precio: number | null; // price
  Moneda: string; // currency
  durationLabel: string | null; // duration_label
  Nivel: string | null; // level
  Categoria: string | null; // category
  sessionCount: number; // session_count
  sessionDurationMinutes: number; // session_duration_minutes
  leadInstructorId: string | null; // lead_instructor_id
  leadInstructorName: string | null; // joined instructors.full_name
  Visibilidad: CourseVisibilidad; // visibility
  Estado: CourseEstado; // status
  Etiquetas: string[]; // tags
  coverImageUrl: string | null; // cover_image_url
  updatedAt: string; // updated_at
  createdAt: string; // created_at
  classTypeId: string | null;
  classTypeName: string | null;
  defaultRoomId: string | null;
  defaultRoomName: string | null;
  hasSessions: boolean;
  bookingWindowDays: number | null;
  cancellationWindowHours: number | null;
};

export type PageProps = {
  initialCourses: CourseRow[];
  instructors: InstructorOption[];
  classTypes: ClassTypeOption[];
  rooms: RoomOption[];
  levelOptions: string[];
  categoryOptions: string[];
};

type FormState = {
  title: string;
  shortDescription: string;
  description: string;
  price: string;
  currency: string;
  durationLabel: string;
  level: string;
  category: string;
  sessionCount: string;
  sessionDurationMinutes: string;
  visibility: CourseVisibilidad;
  status: CourseEstado;
  leadInstructorId: string;
  tags: string;
  classTypeId: string;
  defaultRoomId: string;
  bookingWindowDays: string;
  cancellationWindowHours: string;
};

type CourseApiResponse = {
  course: CourseQueryRow;
};

// === Utilidades ===
const CURRENCY_FORMATTERS: Record<string, Intl.NumberFormat> = {};
function formatCurrency(value: number, currencyCode: string) {
  const key = (currencyCode || "MXN").toUpperCase();
  if (!CURRENCY_FORMATTERS[key]) {
    CURRENCY_FORMATTERS[key] = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return CURRENCY_FORMATTERS[key].format(value);
}

function mapCourse(row: CourseQueryRow, extras?: { hasSessions?: boolean }): CourseRow {
  const bookingWindowRaw = (row as { booking_window_days?: number | null }).booking_window_days;
  const cancellationWindowRaw = (row as { cancellation_window_hours?: number | null })
    .cancellation_window_hours;
  return {
    id: row.id,
    title: row.title,
    Descripcion: row.description ?? null,
    shortDescripcion: row.short_description ?? null,
    Precio: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    Moneda: row.currency ?? "MXN",
    durationLabel: row.duration_label ?? null,
    Nivel: row.level ?? null,
    Categoria: row.category ?? null,
    sessionCount: Number(row.session_count ?? 0),
    sessionDurationMinutes: Number(row.session_duration_minutes ?? 0),
    leadInstructorId: row.lead_instructor_id ?? null,
    leadInstructorName: row.instructors?.full_name ?? null,
    Visibilidad: (row.visibility ?? "PUBLIC") as CourseVisibilidad,
    Estado: (row.status ?? "DRAFT") as CourseEstado,
    Etiquetas: Array.isArray(row.tags) ? row.tags : [],
    coverImageUrl: row.cover_image_url ?? null,
    defaultRoomId: row.default_room_id ?? null,
    defaultRoomName: row.rooms?.name ?? null,
    hasSessions: extras?.hasSessions ?? false,
    bookingWindowDays:
      bookingWindowRaw === null || bookingWindowRaw === undefined
        ? null
        : Number(bookingWindowRaw),
    cancellationWindowHours:
      cancellationWindowRaw === null || cancellationWindowRaw === undefined
        ? null
        : Number(cancellationWindowRaw),
    updatedAt: row.updated_at ?? "",
    createdAt: row.created_at ?? "",
    classTypeId: row.class_type_id ?? null,
    classTypeName: row.class_types?.name ?? null,
  };
}

const FALLBACK_COURSE_LEVELS = [
  "Principiante",
  "Intermedio",
  "Avanzado",
  "Multinivel",
  "Certificación",
];

const FALLBACK_COURSE_CATEGORIES = [
  "Grupal",
  "Privada",
  "Semi-Privada",
  "Promoción",
  "Evento",
];

const DEFAULT_LEVEL_VALUE = "Multinivel";
const DEFAULT_CATEGORY_VALUE = "Grupal";

async function loadEnumOptions(enumName: string, fallback: string[]): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin.rpc("enum_values", {
      enum_name: enumName,
      schema_name: "public",
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Respuesta inválida");
    const values = (data as string[])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
    if (values.length === 0) throw new Error("Enum sin valores");
    return values;
  } catch (error) {
    console.warn(`[courses] enum_values fallback for ${enumName}`, error);
    return [...fallback];
  }
}

// === SSR: lectura de horarios e instructores ===
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [coursesResp, instructorsResp, classTypesResp, roomsResp] = await Promise.all([
    supabaseAdmin
      .from("courses")
      .select(
        "id, title, description, short_description, price, currency, duration_label, level, category, session_count, session_duration_minutes, class_type_id, lead_instructor_id, visibility, status, tags, cover_image_url, booking_window_days, cancellation_window_hours, updated_at, created_at, instructors:lead_instructor_id (id, full_name), class_types:class_type_id (id, name), rooms:default_room_id (id, name)"
      )
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("instructors")
      .select("id, full_name")
      .order("full_name"),
    supabaseAdmin
      .from("class_types")
      .select("id, name, description")
      .order("name"),
    supabaseAdmin
      .from("rooms")
      .select("id, name")
      .order("name"),
  ]);

  if (coursesResp.error) throw coursesResp.error;
  if (instructorsResp.error) throw instructorsResp.error;
  if (classTypesResp.error) throw classTypesResp.error;
  if (roomsResp.error) throw roomsResp.error;

  const courseRows = (coursesResp.data ?? []) as CourseQueryRow[];
  const instructorRows =
    (instructorsResp.data ?? []) as Tables<"instructors">[];
  const classTypeRows = (classTypesResp.data ?? []) as Tables<"class_types">[];
  const roomRows = (roomsResp.data ?? []) as Tables<"rooms">[];

  const courseIds = courseRows.map((row) => row.id).filter(Boolean);
  const uniqueCourseIds = Array.from(new Set(courseIds));
  const coursesWithSessions = new Set<string>();
  if (uniqueCourseIds.length > 0) {
    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from("sessions")
      .select("course_id")
      .in("course_id", uniqueCourseIds);
    if (sessionsError) throw sessionsError;
    (sessionsData ?? []).forEach(({ course_id }) => {
      if (course_id) coursesWithSessions.add(course_id);
    });
  }

  const enumLevelOptions = await loadEnumOptions("course_level", FALLBACK_COURSE_LEVELS);
  const enumCategoryOptions = await loadEnumOptions("category", FALLBACK_COURSE_CATEGORIES);

  const levelSet = new Set(enumLevelOptions);
  const categorySet = new Set(enumCategoryOptions);

  courseRows.forEach((row) => {
    const levelValue = row.level?.trim();
    if (levelValue) levelSet.add(levelValue);
    const categoryValue = row.category?.trim();
    if (categoryValue) categorySet.add(categoryValue);
  });

  const levelOptions = Array.from(levelSet).sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const categoryOptions = Array.from(categorySet).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const initialCourses = courseRows.map((row) =>
    mapCourse(row, { hasSessions: coursesWithSessions.has(row.id) })
  );
  const instructors = instructorRows.map(({ id, full_name }) => ({
    id,
    full_name,
  }));
  const classTypes = classTypeRows.map(({ id, name, description }) => ({
    id,
    name,
    description: description ?? null,
  }));
  const rooms = roomRows.map(({ id, name }) => ({
    id,
    name,
  }));

  return {
    props: {
      initialCourses,
      instructors,
      classTypes,
      rooms,
      levelOptions,
      categoryOptions,
    },
  };
};

const DEFAULT_FORM: FormState = {
  title: "",
  shortDescription: "",
  description: "",
  price: "",
  currency: "MXN",
  durationLabel: "",
  level: "",
  category: "",
  sessionCount: "6",
  sessionDurationMinutes: "55",
  visibility: "PUBLIC",
  status: "DRAFT",
  leadInstructorId: "",
  tags: "",
  classTypeId: "",
  defaultRoomId: "",
  bookingWindowDays: "7",
  cancellationWindowHours: "",
};

export default function CoursesPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const {
    initialCourses,
    instructors,
    classTypes,
    rooms: roomOptions,
    levelOptions,
    categoryOptions,
  } =
    props;

  const [courses, setCourses] = useState<CourseRow[]>(initialCourses);
  const [levels, setLevels] = useState<string[]>(levelOptions);
  const [categories, setCategories] = useState<string[]>(categoryOptions);
  const pickDefaultOption = (options: string[], preferred: string) =>
    options.includes(preferred) ? preferred : options[0] ?? "";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft" | "archived"
  >("all");
  const [formState, setFormState] = useState<FormState>({
    ...DEFAULT_FORM,
    classTypeId: classTypes[0]?.id ?? "",
    level: pickDefaultOption(levelOptions, DEFAULT_LEVEL_VALUE),
    category: pickDefaultOption(categoryOptions, DEFAULT_CATEGORY_VALUE),
    defaultRoomId: roomOptions[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const featureKey: AdminFeatureKey = "courses";
  const pageAccess = useAdminAccess(featureKey);
  const readOnly = !pageAccess.canEdit;

  const ensureOption = (options: string[], value: string | null): string[] => {
    const trimmed = value?.trim();
    if (!trimmed || options.includes(trimmed)) return options;
    const next = [...options, trimmed];
    next.sort((a, b) => a.localeCompare(b, "es"));
    return next;
  };
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const isEditing = editingCourseId !== null;
  const courseBeingEdited = isEditing
    ? courses.find((course) => course.id === editingCourseId) ?? null
    : null;

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesText = !term
        ? true
        : [
            course.title,
            course.Descripcion ?? "",
            course.shortDescripcion ?? "",
            course.Categoria ?? "",
            course.Nivel ?? "",
            course.classTypeName ?? "",
            course.defaultRoomName ?? "",
            course.leadInstructorName ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(term);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : (statusFilter === "published" && course.Estado === "PUBLISHED") ||
            (statusFilter === "draft" && course.Estado === "DRAFT") ||
            (statusFilter === "archived" && course.Estado === "ARCHIVED");

      return matchesText && matchesStatus;
    });
  }, [courses, searchTerm, statusFilter]);

  const handleFormChange =
    (field: keyof FormState) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      const value = event.target.value;
      setFormState((prev) => ({ ...prev, [field]: value }));
    };

  const resetForm = (options?: {
    nextLevels?: string[];
    nextCategories?: string[];
    nextRoomId?: string;
  }) => {
    const currentLevels = options?.nextLevels ?? levels;
    const currentCategories = options?.nextCategories ?? categories;
    setFormState({
      ...DEFAULT_FORM,
      classTypeId: classTypes[0]?.id ?? "",
      level: pickDefaultOption(currentLevels, DEFAULT_LEVEL_VALUE),
      category: pickDefaultOption(currentCategories, DEFAULT_CATEGORY_VALUE),
      defaultRoomId: options?.nextRoomId ?? roomOptions[0]?.id ?? "",
    });
    setFormError(null);
    setEditingCourseId(null);
  };

  const handleEditCourse = (course: CourseRow) => {
    if (readOnly) return;
    const nextLevels = ensureOption(levels, course.Nivel);
    if (nextLevels !== levels) setLevels(nextLevels);
    const nextCategories = ensureOption(categories, course.Categoria);
    if (nextCategories !== categories) setCategories(nextCategories);

    setFormState({
      title: course.title,
      shortDescription: course.shortDescripcion ?? "",
      description: course.Descripcion ?? "",
      price: course.Precio !== null ? String(course.Precio) : "",
      currency: course.Moneda ?? "MXN",
      durationLabel: course.durationLabel ?? "",
      level: course.Nivel ?? "",
      category: course.Categoria ?? "",
      sessionCount: String(course.sessionCount ?? ""),
      sessionDurationMinutes: String(course.sessionDurationMinutes ?? ""),
      visibility: course.Visibilidad,
      status: course.Estado,
      leadInstructorId: course.leadInstructorId ?? "",
      tags: course.Etiquetas.join(", "),
      classTypeId: course.classTypeId ?? "",
      defaultRoomId: course.defaultRoomId ?? "",
      bookingWindowDays:
        course.bookingWindowDays === null || course.bookingWindowDays === undefined
          ? ""
          : String(course.bookingWindowDays),
      cancellationWindowHours:
        course.cancellationWindowHours === null || course.cancellationWindowHours === undefined
          ? ""
          : String(course.cancellationWindowHours),
    });
    setEditingCourseId(course.id);
    setFormMessage(null);
    setFormError(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) {
      setFormError("Tu rol no tiene permisos para crear o editar horarios.");
      return;
    }
    setSaving(true);
    setFormMessage(null);
    setFormError(null);

    try {
      const trimmedTitle = formState.title.trim();
      if (!trimmedTitle) throw new Error("El título es obligatorio");

      const classTypeId = formState.classTypeId.trim();
      if (!classTypeId) throw new Error("Selecciona un tipo de horario");

      const defaultRoomId = formState.defaultRoomId.trim();
      if (hasRoomOptions && !defaultRoomId) {
        throw new Error("Selecciona una sala predeterminada");
      }

      const parsedSessionCount = Number(formState.sessionCount);
      if (!Number.isFinite(parsedSessionCount) || parsedSessionCount <= 0) {
        throw new Error("La cantidad de sesiónes debe ser mayor a cero");
      }

      const parsedSessionDuration = Number(formState.sessionDurationMinutes);
      if (!Number.isFinite(parsedSessionDuration) || parsedSessionDuration <= 0) {
        throw new Error("La duración por sesión debe ser mayor a cero");
      }

      const priceInput = formState.price.trim();
      const parsedPrice = priceInput.length === 0 ? null : Number(priceInput);
      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        throw new Error("El precio debe ser un número válido");
      }

      const trimmedWindow = formState.bookingWindowDays.trim();
      let bookingWindowDays: number | null = null;
      if (trimmedWindow.length > 0) {
        const parsedWindow = Number(trimmedWindow);
        if (!Number.isFinite(parsedWindow) || parsedWindow < 0) {
          throw new Error("La ventana de reserva debe ser un número mayor o igual a cero");
        }
        bookingWindowDays = Math.trunc(parsedWindow);
      }

      const trimmedCancellation = formState.cancellationWindowHours.trim();
      let cancellationWindowHours: number | null = null;
      if (trimmedCancellation.length > 0) {
        const parsedCancellation = Number(trimmedCancellation);
        if (!Number.isFinite(parsedCancellation) || parsedCancellation < 0) {
          throw new Error("La ventana de cancelación debe ser un número mayor o igual a cero");
        }
        cancellationWindowHours = Math.trunc(parsedCancellation);
      }

      const payload = {
        title: trimmedTitle,
        shortDescription: formState.shortDescription.trim() || null,
        description: formState.description.trim() || null,
        price: parsedPrice,
        currency: formState.currency || "MXN",
        durationLabel: formState.durationLabel.trim() || null,
        level: formState.level.trim() || null,
        category: formState.category.trim() || null,
        sessionCount: parsedSessionCount,
        sessionDurationMinutes: parsedSessionDuration,
        visibility: formState.visibility,
        status: formState.status,
        leadInstructorId: formState.leadInstructorId || null,
        tags: formState.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        classTypeId,
        defaultRoomId: defaultRoomId || null,
        bookingWindowDays,
        cancellationWindowHours,
      };

      const existingCourse = editingCourseId
        ? courses.find((course) => course.id === editingCourseId)
        : undefined;
      if (editingCourseId && existingCourse?.hasSessions) {
        throw new Error("Este horario ya tiene sesiónes programadas y no se puede editar");
      }

      const response = await fetch("/api/courses", {
        method: editingCourseId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingCourseId ? { id: editingCourseId, ...payload } : payload
        ),
      });

      const body = (await response.json().catch(() => ({}))) as Partial<
        CourseApiResponse & { error?: string }
      >;
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo guardar el horario");
      }
      if (!body?.course) {
        throw new Error("Respuesta inesperada del servidor");
      }

      const updatedCourse = mapCourse(body.course, {
        hasSessions: editingCourseId
          ? existingCourse?.hasSessions ?? false
          : false,
      });

      const nextLevels = ensureOption(levels, updatedCourse.Nivel);
      const nextCategories = ensureOption(categories, updatedCourse.Categoria);
      if (nextLevels !== levels) setLevels(nextLevels);
      if (nextCategories !== categories) setCategories(nextCategories);

      if (editingCourseId) {
        setCourses((prev) =>
          prev.map((course) =>
            course.id === updatedCourse.id ? updatedCourse : course
          )
        );
      } else {
        setCourses((prev) => [updatedCourse, ...prev]);
      }

      setFormMessage(
        editingCourseId
          ? "Curso actualizado correctamente"
          : "Curso creado correctamente"
      );
      resetForm({ nextLevels, nextCategories });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo guardar el horario"
      );
    } finally {
      setSaving(false);
    }
  };

  const hasClassTypeOptions = classTypes.length > 0;
  const hasRoomOptions = roomOptions.length > 0;

  return (
    <AdminLayoutAny title="Horarios" active="courses" featureKey="courses">
      <Head>
        <meta charSet="utf-8" />
        <title>BInAI Akdemia Admin - Horarios</title>
      </Head>
      {readOnly && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tu rol tiene acceso de solo lectura en esta sección. Puedes consultar los horarios pero no crear o editar
          registros.
        </div>
      )}
      <div className="mx-auto flex max-w-6xl w-full gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <span className="material-icons-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  search
                </span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar horarios..."
                  className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <Link
                href="/courses/scheduler"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <span className="material-icons-outlined text-base">
                  calendar_view_week
                </span>
                Programador
              </Link>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className="ml-auto h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="published">Publicado</option>
                <option value="draft">Borrador</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
            <table className="w-200% table-fixed md:table-auto divide-y divide-slate-100">
              <thead className="bg-slate-50 text-center text-xs font-medium uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-2 w-[20%] whitespace-wrap">Curso</th>
                  <th className="px-2 py-2 w-[16%] whitespace-wrap">Sesiónes</th>
                  <th className="px-2 py-2 w-[16%] whitespace-wrap">Precio</th>
                  <th className="px-2 py-2 w-[16%] whitespace-wrap">Estado</th>
                  <th className="px-2 py-2 w-[16%] whitespace-wrap">Creado</th>
                  <th className="px-2 py-2 w-[16%] whitespace-center">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCourses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-xs text-slate-500"
                    >
                      No hay horarios que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((course) => {
                    const secondaryLines: string[] = [];
                    if (course.classTypeName) secondaryLines.push(course.classTypeName);
                    const levelCategory = [course.Nivel, course.Categoria ?? "General"].filter(Boolean).join(" · ");
                    if (levelCategory) secondaryLines.push(levelCategory);
                    if (course.defaultRoomName) secondaryLines.push(`Sala ${course.defaultRoomName}`);
                    if (course.leadInstructorName) secondaryLines.push(`Instructor ${course.leadInstructorName}`);
                    const isScheduled = course.hasSessions;

                    return (
                      <tr key={course.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            {course.coverImageUrl ? (
                              <Image
                                src={course.coverImageUrl}
                                alt=""
                                width={64} // 16 * 4
                                height={40} // 10 * 4
                                className="h-10 w-16 rounded object-cover ring-1 ring-slate-200"
                                priority={false}
                                unoptimized={false}
                              />
                            ) : (
                              <div className="h-10 w-16 rounded bg-slate-100 ring-1 ring-slate-200" />
                            )}
                            <div className="space-y-1">
                              <div className="font-medium text-slate-800 leading-snug">
                                {course.title}
                              </div>
                              <div className="space-y-0.5 text-xs leading-snug text-slate-500">
                                {secondaryLines.map((line, index) => (
                                  <p key={`${course.id}-line-${index}`}>{line}</p>
                                ))}
                              </div>
                              {isScheduled && (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                                  Programado
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div className="leading-tight">
                            <div>{course.sessionCount} sesiónes</div>
                            <div className="text-xs text-slate-500">
                              {"×"} {course.sessionDurationMinutes} min
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">
                          {course.Precio !== null
                            ? formatCurrency(course.Precio, course.Moneda)
                            : "Gratis"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <CourseEstadoBadge Estado={course.Estado} />
                        </td>
                        <td className="px-4 py-4 align-top text-right text-xs text-slate-500 whitespace-nowrap">
                          {dayjs(course.updatedAt ?? course.createdAt).format(
                            "DD MMM YYYY"
                          )}
                        </td>
                        <td className="px-3 py-4 align-top text-right">
                          <button
                            type="button"
                            onClick={() => handleEditCourse(course)}
                            disabled={readOnly || course.hasSessions || saving}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              course.hasSessions
                                ? "No disponible: ya tiene sesiónes programadas"
                                : "Editar horario"
                            }
                          >
                            <span className="material-icons-outlined text-base">
                              edit
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div ref={formRef} className="w-full max-w-[360px] shrink-0">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-base font-semibold text-slate-800">
              {isEditing ? "Editar horario" : "Crear horario"}
            </h2>
            {isEditing && courseBeingEdited && (
              <p className="mb-3 text-xs text-slate-500">
                Modificando:{" "}
                <span className="font-medium text-slate-700">
                  {courseBeingEdited.title}
                </span>
              </p>
            )}
            {!hasClassTypeOptions && (
              <p className="mb-3 text-sm text-amber-600">
                Registra al menos un tipo de clase antes de crear un horario.
              </p>
            )}
            {!hasRoomOptions && (
              <p className="mb-3 text-sm text-amber-600">
                Registra al menos una sala antes de crear un horario.
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <fieldset disabled={readOnly || saving} className="space-y-4 text-sm">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                  {"Título"}
                </label>
                <input
                  value={formState.title}
                  onChange={handleFormChange("title")}
                  placeholder="Nombre del horario"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                {"Descripción corta"}
                </label>
                <input
                  value={formState.shortDescription}
                  onChange={handleFormChange("shortDescription")}
                  placeholder="Aparece en listados"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                {"Descripción"}
                </label>
                <textarea
                  value={formState.description}
                  onChange={handleFormChange("description")}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Tipo de horario
                </label>
                <select
                  value={formState.classTypeId}
                  onChange={handleFormChange("classTypeId")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  disabled={!hasClassTypeOptions || saving}
                >
                  <option value="">Selecciona un tipo</option>
                  {classTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Instructor principal
                </label>
                <select
                  value={formState.leadInstructorId}
                  onChange={handleFormChange("leadInstructorId")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                >
                  <option value="">Sin asignar</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Sala predeterminada
                </label>
                <select
                  value={formState.defaultRoomId}
                  onChange={handleFormChange("defaultRoomId")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  disabled={!hasRoomOptions || saving}
                >
                  <option value="">Selecciona una sala</option>
                  {roomOptions.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Sesiónes totales
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formState.sessionCount}
                    onChange={handleFormChange("sessionCount")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {"Minutos por sesión"}
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={formState.sessionDurationMinutes}
                    onChange={handleFormChange("sessionDurationMinutes")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Ventana de reserva (días)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formState.bookingWindowDays}
                  onChange={handleFormChange("bookingWindowDays")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  placeholder="7"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Define cuántos días antes de cada sesión se puede reservar. Deja el campo vacío para permitir reservas sin límite.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Ventana de cancelación (horas)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formState.cancellationWindowHours}
                  onChange={handleFormChange("cancellationWindowHours")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  placeholder="24"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Tiempo mínimo de antelación para cancelar sin penalización. Deja el campo vacío para usar el valor predeterminado.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Nivel
                  </label>
                  <select
                    value={formState.level}
                    onChange={handleFormChange("level")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  >
                    <option value="">Selecciona nivel</option>
                    {levels.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {"Categoria"}
                  </label>
                  <select
                    value={formState.category}
                    onChange={handleFormChange("category")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  >
                    <option value="">{"Selecciona Categoria"}</option>
                    {categories.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Precio
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.price}
                    onChange={handleFormChange("price")}
                    placeholder="Ej. 1200"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Moneda
                  </label>
                  <select
                    value={formState.currency}
                    onChange={handleFormChange("currency")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Visibilidad
                  </label>
                  <div className="mt-1 flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="visibility"
                        value="PUBLIC"
                        checked={formState.visibility === "PUBLIC"}
                        onChange={handleFormChange("visibility")}
                        className="h-4 w-4"
                      />
                      {"Público"}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="visibility"
                        value="PRIVATE"
                        checked={formState.visibility === "PRIVATE"}
                        onChange={handleFormChange("visibility")}
                        className="h-4 w-4"
                      />
                      {"Privado"}
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Estado
                  </label>
                  <select
                    value={formState.status}
                    onChange={handleFormChange("status")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  >
                    <option value="DRAFT">Borrador</option>
                    <option value="PUBLISHED">Publicado</option>
                    <option value="ARCHIVED">Archivado</option>
                  </select>
                </div>
              </div>

              {formMessage && (
                <p className="text-sm text-emerald-600">{formMessage}</p>
              )}
              {formError && (
                <p className="text-sm text-rose-600">{formError}</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormMessage(null);
                  }}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm"
                  disabled={saving}
                >
                  {isEditing ? "Cancelar" : "Limpiar"}
                </button>
                <button
                  type="submit"
                  disabled={saving || !hasClassTypeOptions || !hasRoomOptions}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving
                    ? "Guardando..."
                    : isEditing
                    ? "Actualizar horario"
                    : "Guardar horario"}
                </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      </div>
    </AdminLayoutAny>
  );
}

function CourseEstadoBadge({ Estado }: { Estado: CourseEstado }) {
  if (Estado === "PUBLISHED") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Publicado
      </span>
    );
  }
  if (Estado === "ARCHIVED") {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
        Archivado
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Borrador
    </span>
  );
}

