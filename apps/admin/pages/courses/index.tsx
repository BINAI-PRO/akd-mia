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

type CourseQueryRow = Tables<"courses"> & {
  instructors?: { id: string; full_name: string | null } | null;
  class_types?: { id: string; name: string | null } | null;
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
};

export type PageProps = {
  initialCourses: CourseRow[];
  instructors: InstructorOption[];
  classTypes: ClassTypeOption[];
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

function mapCourse(row: CourseQueryRow): CourseRow {
  return {
    id: row.id,
    title: row.title,
    Descripcion: row.description ?? null,
    shortDescripcion: row.short_description ?? null,
    Precio:
      row.price !== null && row.price !== undefined ? Number(row.price) : null,
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
    updatedAt: row.updated_at ?? "",
    createdAt: row.created_at ?? "",
    classTypeId: row.class_type_id ?? null,
    classTypeName: row.class_types?.name ?? null,
  };
}

// === SSR: lectura de cursos e instructores ===
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [coursesResp, instructorsResp, classTypesResp] = await Promise.all([
    supabaseAdmin
      .from("courses")
      .select(
        "id, title, description, short_description, price, currency, duration_label, level, category, session_count, session_duration_minutes, class_type_id, lead_instructor_id, visibility, status, tags, cover_image_url, updated_at, created_at, instructors:lead_instructor_id (id, full_name), class_types:class_type_id (id, name)"
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
  ]);

  if (coursesResp.error) throw coursesResp.error;
  if (instructorsResp.error) throw instructorsResp.error;
  if (classTypesResp.error) throw classTypesResp.error;

  const courseRows = (coursesResp.data ?? []) as CourseQueryRow[];
  const instructorRows =
    (instructorsResp.data ?? []) as Tables<"instructors">[];
  const classTypeRows = (classTypesResp.data ?? []) as Tables<"class_types">[];

  const initialCourses = courseRows.map(mapCourse);
  const instructors = instructorRows.map(({ id, full_name }) => ({
    id,
    full_name,
  }));
  const classTypes = classTypeRows.map(({ id, name, description }) => ({
    id,
    name,
    description: description ?? null,
  }));

  const levelSet = new Set<string>();
  courseRows.forEach((row) => {
    if (row.level && row.level.trim()) levelSet.add(row.level.trim());
  });
  if (!levelSet.has("Multinivel")) levelSet.add("Multinivel");

  const categorySet = new Set<string>();
  courseRows.forEach((row) => {
    if (row.category && row.category.trim())
      categorySet.add(row.category.trim());
  });
  if (!categorySet.has("General")) categorySet.add("General");

  const levelOptions = Array.from(levelSet).sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const categoryOptions = Array.from(categorySet).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  return {
    props: { initialCourses, instructors, classTypes, levelOptions, categoryOptions },
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
};

export default function CoursesPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const { initialCourses, instructors, classTypes, levelOptions, categoryOptions } =
    props;

  const [courses, setCourses] = useState<CourseRow[]>(initialCourses);
  const [levels, setLevels] = useState<string[]>(levelOptions);
  const [categories, setCategories] = useState<string[]>(categoryOptions);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft" | "archived"
  >("all");
  const [formState, setFormState] = useState<FormState>({
    ...DEFAULT_FORM,
    classTypeId: classTypes[0]?.id ?? "",
    level: levelOptions[0] ?? "",
    category: categoryOptions[0] ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const ensureOption = (options: string[], value: string | null): string[] => {
    const trimmed = value?.trim();
    if (!trimmed || options.includes(trimmed)) return options;
    const next = [...options, trimmed];
    next.sort((a, b) => a.localeCompare(b, "es"));
    return next;
  };
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

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
  }) => {
    const currentLevels = options?.nextLevels ?? levels;
    const currentCategories = options?.nextCategories ?? categories;
    setFormState({
      ...DEFAULT_FORM,
      classTypeId: classTypes[0]?.id ?? "",
      level: currentLevels[0] ?? "",
      category: currentCategories[0] ?? "",
    });
    setFormMessage(null);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormMessage(null);
    setFormError(null);

    try {
      const trimmedTitle = formState.title.trim();
      if (!trimmedTitle) throw new Error("El titulo es obligatorio");
      if (!formState.classTypeId) throw new Error("Selecciona un tipo de curso");

      const parsedSessionCount = Number(formState.sessionCount);
      if (!Number.isFinite(parsedSessionCount) || parsedSessionCount <= 0) {
        throw new Error("La cantidad de sesiones debe ser mayor a cero");
      }

      const parsedSessionDuration = Number(formState.sessionDurationMinutes);
      if (!Number.isFinite(parsedSessionDuration) || parsedSessionDuration <= 0) {
        throw new Error("La duracion por sesion debe ser mayor a cero");
      }

      const priceInput = formState.price.trim();
      const parsedPrice = priceInput.length === 0 ? null : Number(priceInput);
      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        throw new Error("El precio debe ser un numero valido");
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
        classTypeId: formState.classTypeId,
      };

      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as Partial<
        CourseApiResponse & { error?: string }
      >;
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo crear el curso");
      }
      if (!body?.course) {
        throw new Error("Respuesta inesperada del servidor");
      }

      const newCourse = mapCourse(body.course);

      const nextLevels = ensureOption(levels, newCourse.Nivel);
      const nextCategories = ensureOption(categories, newCourse.Categoria);
      if (nextLevels !== levels) setLevels(nextLevels);
      if (nextCategories !== categories) setCategories(nextCategories);

      setCourses((prev) => [newCourse, ...prev]);
      setFormMessage("Curso creado correctamente");
      resetForm({ nextLevels, nextCategories });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo crear el curso"
      );
    } finally {
      setSaving(false);
    }
  };

  const hasClassTypeOptions = classTypes.length > 0;

  return (
    <AdminLayoutAny title="Cursos" active="courses">
      <Head>
        <title>PilatesTime Admin - Cursos</title>
      </Head>
      <div className="mx-auto flex max-w-6xl gap-6">
        <div className="flex-1 space-y-6">
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
                  placeholder="Buscar cursos..."
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

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Sesiones</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCourses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No hay cursos que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((course) => (
                    <tr key={course.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {course.coverImageUrl ? (
                            <Image
                              src={course.coverImageUrl}
                              alt=""
                              width={64}   // 16 * 4
                              height={40}  // 10 * 4
                              className="h-10 w-16 rounded object-cover ring-1 ring-slate-200"
                              priority={false}
                              unoptimized={false}
                            />
                          ) : (
                            <div className="h-10 w-16 rounded bg-slate-100 ring-1 ring-slate-200" />
                          )}
                          <div>
                            <div className="font-medium text-slate-800">
                              {course.title}
                            </div>
                            <div className="text-xs text-slate-500">
                              {[course.classTypeName, course.Nivel, course.Categoria ?? "General"]
                                .filter(Boolean)
                                .join(" | ")}
                              {course.leadInstructorName
                                ? ` | ${course.leadInstructorName}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {course.sessionCount} sesiones x{" "}
                        {course.sessionDurationMinutes} min
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {course.Precio !== null
                          ? formatCurrency(course.Precio, course.Moneda)
                          : "Gratis"}
                      </td>
                      <td className="px-4 py-3">
                        <CourseEstadoBadge Estado={course.Estado} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {dayjs(course.updatedAt ?? course.createdAt).format(
                          "DD MMM YYYY"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div ref={formRef} className="w-full max-w-[360px] shrink-0">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-slate-800">
              Crear curso
            </h2>
            {!hasClassTypeOptions && (
              <p className="mb-3 text-sm text-amber-600">
                Registra al menos una clase antes de crear un curso.
              </p>
            )}
            <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Titulo
                </label>
                <input
                  value={formState.title}
                  onChange={handleFormChange("title")}
                  placeholder="Nombre del curso"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Descripcion corta
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
                  Descripcion
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
                  Tipo de curso
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Sesiones totales
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
                    Minutos por sesiÃ³n
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
                  Etiqueta de duraciÃ³n
                </label>
                <input
                  value={formState.durationLabel}
                  onChange={handleFormChange("durationLabel")}
                  placeholder="Ej. 8 sesiones (55 min)"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-2 gap-3">
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
                    Categoria
                  </label>
                  <select
                    value={formState.category}
                    onChange={handleFormChange("category")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                  >
                    <option value="">Selecciona categoria</option>
                    {categories.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Etiquetas
                </label>
                <input
                  value={formState.tags}
                  onChange={handleFormChange("tags")}
                  placeholder="Separadas por coma"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Visibilidad
                  </label>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="visibility"
                        value="PUBLIC"
                        checked={formState.visibility === "PUBLIC"}
                        onChange={handleFormChange("visibility")}
                        className="h-4 w-4"
                      />
                      PÃºblico
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
                      Privado (solo invitaciÃ³n)
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

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm"
                  disabled={saving}
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  disabled={saving || !hasClassTypeOptions}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar curso"}
                </button>
              </div>
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

