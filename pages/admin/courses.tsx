import Head from "next/head";
import { useMemo, useRef, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CourseStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED";
type CourseVisibility = "PUBLIC" | "PRIVATE";

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  price: number | null;
  currency: string;
  durationLabel: string | null;
  level: string | null;
  category: string | null;
  visibility: CourseVisibility;
  status: CourseStatus;
  tags: string[];
  coverImageUrl: string | null;
  updatedAt: string;
  createdAt: string;
};

type PageProps = {
  initialCourses: CourseRow[];
};

const CURRENCY_FORMATTERS: Record<string, Intl.NumberFormat> = {};
function formatCurrency(value: number, currency: string) {
  const key = currency.toUpperCase();
  if (!CURRENCY_FORMATTERS[key]) {
    CURRENCY_FORMATTERS[key] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return CURRENCY_FORMATTERS[key].format(value);
}

function mapCourse(row: any): CourseRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    shortDescription: row.short_description,
    price: row.price !== null ? Number(row.price) : null,
    currency: row.currency ?? "MXN",
    durationLabel: row.duration_label,
    level: row.level,
    category: row.category,
    visibility: (row.visibility ?? "PUBLIC") as CourseVisibility,
    status: (row.status ?? "DRAFT") as CourseStatus,
    tags: Array.isArray(row.tags) ? row.tags : [],
    coverImageUrl: row.cover_image_url,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select(
      "id, title, description, short_description, price, currency, duration_label, level, category, visibility, status, tags, cover_image_url, updated_at, created_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getServerSideProps /admin/courses", error);
    return {
      props: {
        initialCourses: [],
      },
    };
  }

  const initialCourses = (data ?? []).map(mapCourse);

  return {
    props: {
      initialCourses,
    },
  };
};

type StatusFilter = "all" | "published" | "draft" | "archived";

type FormState = {
  title: string;
  shortDescription: string;
  description: string;
  price: string;
  currency: string;
  durationLabel: string;
  level: string;
  category: string;
  visibility: CourseVisibility;
  status: CourseStatus;
  tags: string;
  coverImageUrl: string;
};

const DEFAULT_FORM: FormState = {
  title: "",
  shortDescription: "",
  description: "",
  price: "",
  currency: "MXN",
  durationLabel: "",
  level: "All Levels",
  category: "General",
  visibility: "PUBLIC",
  status: "DRAFT",
  tags: "",
  coverImageUrl: "",
};

const CATEGORY_OPTIONS = [
  "General",
  "Mat Pilates",
  "Reformer",
  "Pre-natal",
  "Post-natal",
  "Workshops",
  "Virtual",
];

const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "All Levels"];

export default function AdminCoursesPage({ initialCourses }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [courses, setCourses] = useState<CourseRow[]>(initialCourses);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return courses.filter((course) => {
      if (term) {
        const haystack = `${course.title} ${course.category ?? ""} ${course.level ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter === "published" && course.status !== "PUBLISHED") return false;
      if (statusFilter === "draft" && course.status !== "DRAFT") return false;
      if (statusFilter === "archived" && course.status !== "ARCHIVED") return false;
      return true;
    });
  }, [courses, searchTerm, statusFilter]);

  const handleScrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFormChange = <K extends keyof FormState>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setFormState((prev) => ({ ...prev, [key]: value }));
    };

  const resetForm = () => {
    setFormState(DEFAULT_FORM);
    setMessage(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (!formState.title.trim()) {
        throw new Error("El titulo es obligatorio");
      }

      const numericPrice = formState.price ? Number(formState.price) : null;
      if (formState.price && (Number.isNaN(numericPrice) || numericPrice === null || numericPrice < 0)) {
        throw new Error("El precio debe ser un numero positivo");
      }

      const tagList = formState.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const payload = {
        title: formState.title.trim(),
        shortDescription: formState.shortDescription.trim() || null,
        description: formState.description.trim() || null,
        price: numericPrice,
        currency: formState.currency,
        durationLabel: formState.durationLabel.trim() || null,
        level: formState.level,
        category: formState.category,
        visibility: formState.visibility,
        status: formState.status,
        tags: tagList,
        coverImageUrl: formState.coverImageUrl.trim() || null,
      };

      const response = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo crear el curso");
      }

      const body = await response.json();
      const newCourse = mapCourse(body.course);
      setCourses((prev) => [newCourse, ...prev]);
      setMessage("Curso creado correctamente");
      resetForm();
    } catch (err: any) {
      setError(err?.message || "No se pudo crear el curso");
    } finally {
      setSaving(false);
    }
  };

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <div className="relative hidden lg:block">
        <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search courses..."
          className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notificaciones">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      <img src="/angie.jpg" alt="Usuario" className="h-9 w-9 rounded-full object-cover" />
    </div>
  );

  return (
    <AdminLayout title="Courses" active="courses" headerToolbar={headerToolbar}>
      <Head>
        <title>PilatesTime Admin - Courses</title>
      </Head>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-semibold">All Courses</h2>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <button
                type="button"
                onClick={handleScrollToForm}
                className="flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <span className="material-icons-outlined mr-2 text-base">add</span>
                New Course
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Pricing</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                        No courses match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCourses.map((course) => (
                      <tr key={course.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{course.title}</p>
                          <p className="text-xs text-slate-500">
                            {(course.category ?? "General")} � {(course.level ?? "All Levels")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {course.price !== null ? formatCurrency(course.price, course.currency) : "Free"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{course.durationLabel || "�"}</td>
                        <td className="px-4 py-3">
                          <CourseStatusBadge status={course.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {dayjs(course.updatedAt ?? course.createdAt).format("DD MMM YYYY")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-xs text-slate-500">
              * Editing, duplication, and deletion actions will be enabled once workflows are connected.
            </p>
          </div>
        </section>

        <section ref={formRef} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Create Course</h3>
            <p className="mt-1 text-xs text-slate-500">
              Completa los campos para publicar un curso disponible en la app o dejarlo como borrador.
            </p>
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Title</label>
                <input
                  value={formState.title}
                  onChange={handleFormChange("title")}
                  placeholder="Course title"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Short description</label>
                <input
                  value={formState.shortDescription}
                  onChange={handleFormChange("shortDescription")}
                  placeholder="Appears in listings"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={formState.description}
                  onChange={handleFormChange("description")}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Price</label>
                  <input
                    value={formState.price}
                    onChange={handleFormChange("price")}
                    placeholder="e.g. 120.00"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Currency</label>
                  <select
                    value={formState.currency}
                    onChange={handleFormChange("currency")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {['MXN','USD','EUR','GBP'].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Duration</label>
                <input
                  value={formState.durationLabel}
                  onChange={handleFormChange("durationLabel")}
                  placeholder="e.g. 6 weeks"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Level</label>
                  <select
                    value={formState.level}
                    onChange={handleFormChange("level")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {LEVEL_OPTIONS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Category</label>
                  <select
                    value={formState.category}
                    onChange={handleFormChange("category")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Visibility</label>
                <div className="mt-1 flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      value="PUBLIC"
                      checked={formState.visibility === "PUBLIC"}
                      onChange={() => setFormState((prev) => ({ ...prev, visibility: "PUBLIC" }))}
                      className="h-4 w-4"
                    />
                    Public
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      value="PRIVATE"
                      checked={formState.visibility === "PRIVATE"}
                      onChange={() => setFormState((prev) => ({ ...prev, visibility: "PRIVATE" }))}
                      className="h-4 w-4"
                    />
                    Private (invite only)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={formState.status}
                  onChange={handleFormChange("status")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Tags</label>
                <input
                  value={formState.tags}
                  onChange={handleFormChange("tags")}
                  placeholder="Separated by commas"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Cover image URL</label>
                <input
                  value={formState.coverImageUrl}
                  onChange={handleFormChange("coverImageUrl")}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {message && <p className="text-sm text-emerald-600">{message}</p>}
              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="rounded-md border border-slate-200 px-4 py-2 text-sm">
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save course"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

type StatusBadgeProps = {
  status: CourseStatus;
};

function CourseStatusBadge({ status }: StatusBadgeProps) {
  if (status === "PUBLISHED") {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Published</span>;
  }
  if (status === "ARCHIVED") {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Archived</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Draft</span>;
}
