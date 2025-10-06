// pages/admin/planeacion/instructores.tsx
// Encoding: UTF-8

import * as React from "react";
import Head from "next/head";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { Database } from "@/types/database";

type CT = Database["public"]["Tables"]["class_types"]["Row"];
type InstructorRow = Database["public"]["Tables"]["instructors"]["Row"];
type PivotRow = Database["public"]["Tables"]["instructor_class_types"]["Row"];

type InstructorVM = {
  id: string;
  fullName: string;
  email: string | null;
  phone1: string | null;
  phone2: string | null;
  phone1HasWhatsapp: boolean;
  phone2HasWhatsapp: boolean;
  classTypeIds: string[];
};

type PageProps = { instructors: InstructorVM[]; classTypes: CT[] };

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data: instructorsRaw, error: e1 } = await supabaseAdmin
    .from("instructors")
    .select("id, full_name, email, phone1, phone2, phone1_has_whatsapp, phone2_has_whatsapp")
    .returns<InstructorRow[]>();
  if (e1) throw e1;

  const { data: classTypes, error: e2 } = await supabaseAdmin
    .from("class_types")
    .select("id, name, description")
    .order("name")
    .returns<CT[]>();
  if (e2) throw e2;

  const { data: pivots, error: e3 } = await supabaseAdmin
    .from("instructor_class_types")
    .select("instructor_id, class_type_id, certified, certified_at, notes")
    .returns<PivotRow[]>();
  if (e3) throw e3;

  const map = new Map<string, string[]>();
  (pivots ?? []).forEach((p) => {
    const arr = map.get(p.instructor_id) ?? [];
    arr.push(p.class_type_id);
    map.set(p.instructor_id, arr);
  });

  const instructors: InstructorVM[] = (instructorsRaw ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email ?? null,
    phone1: r.phone1 ?? null,
    phone2: r.phone2 ?? null,
    phone1HasWhatsapp: !!r.phone1_has_whatsapp,
    phone2HasWhatsapp: !!r.phone2_has_whatsapp,
    classTypeIds: map.get(r.id) ?? [],
  }));

  return { props: { instructors, classTypes: classTypes ?? [] } };
};

const splitName = (full: string) => {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};
const combineName = (first: string, last: string) =>
  [first.trim(), last.trim()].filter(Boolean).join(" ");

export default function InstructorsPage({
  instructors: initial,
  classTypes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [instructors, setInstructors] = React.useState<InstructorVM[]>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const selected = React.useMemo(
    () => instructors.find((i) => i.id === selectedId) ?? null,
    [instructors, selectedId]
  );

  // Form state
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone1, setPhone1] = React.useState("");
  const [phone2, setPhone2] = React.useState("");
  const [wa1, setWa1] = React.useState(false);
  const [wa2, setWa2] = React.useState(false);
  const [classTypeIds, setClassTypeIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ t: "ok" | "err"; m: string } | null>(null);

  // Sincroniza formulario al cambiar el seleccionado
  React.useEffect(() => {
    if (!selected) return;
    const { first, last } = splitName(selected.fullName);
    setFirstName(first);
    setLastName(last);
    setEmail(selected.email ?? "");
    setPhone1(selected.phone1 ?? "");
    setPhone2(selected.phone2 ?? "");
    setWa1(!!selected.phone1HasWhatsapp);
    setWa2(!!selected.phone2HasWhatsapp);
    setClassTypeIds(selected.classTypeIds ?? []);
  }, [selectedId]);

  const toggleType = (id: string) =>
    setClassTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      const body = {
        firstName,
        lastName,
        email,
        phone1,
        phone2,
        phone1WhatsApp: wa1,
        phone2WhatsApp: wa2,
        classTypeIds,
      };
      const res = await fetch(`/api/admin/instructors/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const updated: InstructorVM = await res.json();
      setInstructors((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setMsg({ t: "ok", m: "¡Cambios guardados!" });
    } catch (e: any) {
      setMsg({ t: "err", m: e.message ?? "Error guardando" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Planeación · Instructores" active="planningInstructors">
      <Head>
        <title>PilatesTime · Planeación · Instructores</title>
      </Head>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {msg && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              msg.t === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {msg.m}
          </div>
        )}

        {/* Selector de instructor (pulldown) */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Selecciona instructor
            </span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.fullName} {i.email ? `(${i.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Datos básicos */}
        {selected && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Datos del instructor
              </header>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Nombre
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Apellido
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label className="block text-sm md:col-span-2 lg:col-span-1">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Correo
                  </span>
                  <input
                    type="email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@dominio.com"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Teléfono 1
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={phone1}
                      onChange={(e) => setPhone1(e.target.value)}
                      placeholder="Ej. +52 55 0000 0000"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={wa1} onChange={(e) => setWa1(e.target.checked)} />
                      WhatsApp
                    </label>
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Teléfono 2
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={phone2}
                      onChange={(e) => setPhone2(e.target.value)}
                      placeholder="Opcional"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={wa2} onChange={(e) => setWa2(e.target.checked)} />
                      WhatsApp
                    </label>
                  </div>
                </label>
              </div>
            </section>

            {/* Tipo de clase */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Tipo de clase
              </header>
              <div className="grid grid-cols-1 gap-2 p-4 text-sm sm:grid-cols-2 md:grid-cols-3">
                {classTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={classTypeIds.includes(ct.id)}
                      onChange={() => setClassTypeIds((prev) =>
                        prev.includes(ct.id) ? prev.filter((x) => x !== ct.id) : [...prev, ct.id]
                      )}
                    />
                    {ct.name}
                  </label>
                ))}
              </div>
            </section>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm"
                onClick={() => {
                  const { first, last } = splitName(selected.fullName);
                  setFirstName(first);
                  setLastName(last);
                  setEmail(selected.email ?? "");
                  setPhone1(selected.phone1 ?? "");
                  setPhone2(selected.phone2 ?? "");
                  setWa1(!!selected.phone1HasWhatsapp);
                  setWa2(!!selected.phone2HasWhatsapp);
                  setClassTypeIds(selected.classTypeIds ?? []);
                }}
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
