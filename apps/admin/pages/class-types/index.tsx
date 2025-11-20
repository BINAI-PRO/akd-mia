import Head from "next/head";
import { useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import type { AdminFeatureKey } from "@/lib/admin-access";

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
  if (!value) return "-";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const featureKey: AdminFeatureKey = "classTypes";
  const pageAccess = useAdminAccess(featureKey);
  const readOnly = !pageAccess.canEdit;
  const canDelete = pageAccess.canDelete;

  const intensityOptions = useMemo(() => {
    const values = new Set<string>();
    classTypes.forEach((item) => item.intensity && values.add(item.intensity));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [classTypes]);

  const filteredList = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return classTypes.filter((item) => {
      if (filters.intensity !== "all" && item.intensity !== filters.intensity) return false;
      if (filters.target !== "all" && item.targetAudience !== filters.target) return false;
      if (!term) return true;
      const haystack = [item.name, item.description, item.targetAudience].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [classTypes, filters]);

  const handleFormChange =
    <Field extends keyof FormState>(field: Field) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const canSubmit = !readOnly && formState.name.trim().length > 0 && !saving;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) {
      setError("No tienes permisos de edición para crear o actualizar clases.");
      return;
    }
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        id: editingId ?? undefined,
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        intensity: formState.intensity || null,
        targetAudience: formState.targetAudience.trim() || null,
      };

      const response = await fetch("/api/class-types", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? "No se pudo guardar la clase");
      }

      const body = await response.json();
      const updated: ClassTypeItem = {
        ...body.classType,
        createdAt: null,
      };

      setClassTypes((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === updated.id);
        if (existingIndex >= 0) {
          const copy = [...prev];
          copy[existingIndex] = updated;
          return copy.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
        }
        return [updated, ...prev].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
      });

      setFormState({ name: "", description: "", intensity: INTENSITY_OPTIONS[0], targetAudience: "" });
      setEditingId(null);
      setMessage(body?.message ?? (editingId ? "Clase actualizada" : "Clase creada"));
    } catch (submissionError) {
      console.error(submissionError);
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo guardar la clase");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ClassTypeItem) => {
    setEditingId(item.id);
    setFormState({
      name: item.name,
      description: item.description ?? "",
      intensity: item.intensity ?? INTENSITY_OPTIONS[0],
      targetAudience: item.targetAudience ?? "",
    });
    setMessage(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormState({ name: "", description: "", intensity: INTENSITY_OPTIONS[0], targetAudience: "" });
    setMessage(null);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    const confirmed = window.confirm("Esta acción eliminará la clase. ¿Continuar?");
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/class-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? "No se pudo eliminar la clase");
      }
      setClassTypes((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
      setMessage("Clase eliminada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la clase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Clases" active="classTypes" featureKey="classTypes">
      <Head>
        <title>Akdemia by BInAI</title>
      </Head>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-2">
              <div>
                <h1 className="text-2xl font-semibold text-slate-800">Clases</h1>
                <p className="text-sm text-slate-500">
                  Gestiona las clases disponibles para tus horarios y sesiones.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <input
                  type="search"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Buscar por nombre o descripción"
                  className="h-10 w-80 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
              </div>
            </div>
          </header>

          <div className="px-6 py-4">
            {filteredList.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">No se encontraron clases.</div>
            ) : (
              <div className="space-y-3">
                {filteredList.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200"
                  >
                    <header className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-800">{item.name}</h2>
                        <p className="text-xs text-slate-500">
                          Registrada {item.createdAt ? dayjs(item.createdAt).format("DD MMM YYYY") : "-"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.intensity && (
                          <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                            {pretty(item.intensity)}
                          </span>
                        )}
                        {!readOnly && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
                            >
                              Editar
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                disabled={saving}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </header>
                    {item.description && <p className="mt-3 text-sm text-slate-600">{item.description}</p>}
                    <footer className="mt-3 text-xs text-slate-500">Dirigido a: {pretty(item.targetAudience)}</footer>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex h-max flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <header className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-semibold text-slate-800">
              {editingId ? "Editar clase" : "Agregar clase"}
            </h2>
            <p className="text-sm text-slate-500">
              {editingId
                ? "Actualiza los datos de la clase seleccionada."
                : "Define una nueva clase para usar en horarios y sesiones."}
            </p>
          </header>

          {readOnly && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Tu rol actual solo permite lectura. Solicita permisos de edición para administrar el catálogo.
            </p>
          )}

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
                  disabled={readOnly}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Intensidad</span>
                <select
                  value={formState.intensity}
                  onChange={handleFormChange("intensity")}
                  className="rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  disabled={readOnly}
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
                  disabled={readOnly}
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
                  disabled={readOnly}
                />
              </label>
            </div>

            {message && <p className="text-xs text-emerald-600">{message}</p>}
            {error && <p className="text-xs text-rose-600">{error}</p>}

            <div className="flex items-center justify-end gap-3">
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  disabled={saving}
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar clase"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AdminLayout>
  );
}

