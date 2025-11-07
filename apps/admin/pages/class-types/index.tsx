import Head from "next/head";
import { useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import dayjs from "dayjs";

type ClassTypeItem = {
  id: string;
  name: string;
  description: string | null;
  intensity: string | null;
  targetAudience: string | null;
  createdAt: string | null;
};

type PageProps = {
  initialClassTypes: ClassTypeItem[];
};

type FormState = {
  name: string;
  description: string;
  intensity: string;
  targetAudience: string;
};

const INTENSITY_OPTIONS = ["LEVE", "MEDIA", "ALTA", "MEDIA A ALTA", "MULTINIVEL"] as const;

const pretty = (value: string | null | undefined) => {
  if (!value) return "—";
  return value
    .split(" ")
    .map((token) => (token ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token))
    .join(" ");
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data, error } = await supabaseAdmin
    .from("class_types")
    .select("id, name, description, intensity, target_audience")
    .order("name");

  if (error) {
    console.error(error);
    return { props: { initialClassTypes: [] } };
  }

  console.log("[class-types] fetched", data?.length ?? 0);

  const initialClassTypes: ClassTypeItem[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    intensity: row.intensity ?? null,
    targetAudience: row.target_audience ?? null,
    createdAt: null,
  }));

  return { props: { initialClassTypes } };
};

export default function ClassTypesPage({ initialClassTypes }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [classTypes, setClassTypes] = useState<ClassTypeItem[]>(initialClassTypes);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    description: "",
    intensity: INTENSITY_OPTIONS[0],
    targetAudience: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: "", intensity: "all", target: "all" });

  const intensityOptions = useMemo(() => {
    const values = new Set<string>();
    classTypes.forEach((item) => item.intensity && values.add(item.intensity));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [classTypes]);

  const targetOptions = useMemo(() => {
    const values = new Set<string>();
    classTypes.forEach((item) => item.targetAudience && values.add(item.targetAudience));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [classTypes]);

  const filteredList = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return classTypes.filter((item) => {
      if (filters.intensity !== "all" && item.intensity !== filters.intensity) return false;
      if (filters.target !== "all" && item.targetAudience !== filters.target) return false;
      if (!term) return true;
      const haystack = [item.name, item.description, item.targetAudience]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [classTypes, filters]);

  const handleFormChange =
    <Field extends keyof FormState>(field: Field) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const canSubmit = formState.name.trim().length > 0 && !saving;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        intensity: formState.intensity || null,
        targetAudience: formState.targetAudience.trim() || null,
      };

      const response = await fetch("/api/class-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? "No se pudo crear la clase");
      }

      const body = await response.json();
      const created: ClassTypeItem = {
        ...body.classType,
        createdAt: null,
      };
      setClassTypes((prev) =>
        [created, ...prev].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      );
      setFormState({ name: "", description: "", intensity: INTENSITY_OPTIONS[0], targetAudience: "" });
      setMessage(body?.message ?? "Clase creada");
    } catch (submissionError) {
      console.error(submissionError);
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo crear la clase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Clases" active="classTypes">
      <Head>
        <title>PilatesTime Admin - Clases</title>
      </Head>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-800">Clases</h1>
                <p className="text-sm text-slate-500">Gestiona las clases disponibles para tus horarios y sesiónes.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <input
                  type="search"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Buscar por nombre o descripción"
                  className="h-10 w-60 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <select
                  value={filters.intensity}
                  onChange={(event) => setFilters((prev) => ({ ...prev, intensity: event.target.value }))}
                  className="h-10 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="all">Todas las intensidades</option>
                  {intensityOptions.map((option) => (
                    <option key={option} value={option}>
                      {pretty(option)}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.target}
                  onChange={(event) => setFilters((prev) => ({ ...prev, target: event.target.value }))}
                  className="h-10 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="all">Todos los públicos</option>
                  {targetOptions.map((option) => (
                    <option key={option} value={option}>
                      {pretty(option)}
                    </option>
                  ))}
                </select>
                {(filters.search || filters.intensity !== "all" || filters.target !== "all") && (
                  <button
                    type="button"
                    onClick={() => setFilters({ search: "", intensity: "all", target: "all" })}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="max-h-[70vh] overflow-auto px-6 py-4">
            {filteredList.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">No se encontraron clases.</div>
            ) : (
              <div className="space-y-3">
                {filteredList.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200"
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-800">{item.name}</h2>
                        <p className="text-xs text-slate-500">
                          Registrada {item.createdAt ? dayjs(item.createdAt).format("DD MMM YYYY") : "—"}
                        </p>
                      </div>
                      {item.intensity && (
                        <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                          {pretty(item.intensity)}
                        </span>
                      )}
                    </header>
                    {item.description && <p className="mt-3 text-sm text-slate-600">{item.description}</p>}
                    <footer className="mt-3 text-xs text-slate-500">
                      Dirigido a: {pretty(item.targetAudience)}
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex h-max flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <header className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-semibold text-slate-800">Agregar clase</h2>
            <p className="text-sm text-slate-500">Define una nueva clase para usar en horarios y sesiónes.</p>
          </header>

          <form onSubmit={handleSubmit} className="mt-2 space-y-4 text-sm" noValidate>
            <div className="grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Nombre*</span>
                <input
                  type="text"
                  value={formState.name}
                  onChange={handleFormChange("name")}
                  placeholder="Ej. Reformer Básico"
                  className="rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Intensidad</span>
                <select
                  value={formState.intensity}
                  onChange={handleFormChange("intensity")}
                  className="rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {INTENSITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {pretty(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Descripción</span>
                <textarea
                  value={formState.description}
                  onChange={handleFormChange("description")}
                  rows={3}
                  className="rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  placeholder="Describe los objetivos o el enfoque de la clase"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Dirigido a</span>
                <textarea
                  value={formState.targetAudience}
                  onChange={handleFormChange("targetAudience")}
                  rows={2}
                  className="rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  placeholder="Ej. Principiantes, intermedios, adultos mayores"
                />
              </label>
            </div>

            {message && <p className="text-xs text-emerald-600">{message}</p>}
            {error && <p className="text-xs text-rose-600">{error}</p>}

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar clase"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AdminLayout>
  );
}





