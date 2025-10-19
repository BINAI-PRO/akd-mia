import Head from "next/head";
import Link from "next/link";
import dayjs from "dayjs";
import { useMemo, useState, type ComponentType, type PropsWithChildren } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

const AdminLayoutAny = AdminLayout as unknown as ComponentType<PropsWithChildren<Record<string, unknown>>>;

type MembershipTypeRow = Tables<"membership_types">;
type MembershipRow = Tables<"memberships">;

type MembershipListRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  privileges: string | null;
  allowMultiYear: boolean;
  maxPrepaidYears: number | null;
  isActive: boolean;
  updatedAt: string | null;
  activeMembers: number;
};

type PageProps = {
  initialMemberships: MembershipListRow[];
};

type FormState = {
  name: string;
  description: string;
  price: string;
  currency: string;
  privileges: string;
  allowMultiYear: boolean;
  maxPrepaidYears: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "MXN",
  privileges: "",
  allowMultiYear: true,
  maxPrepaidYears: "",
  isActive: true,
};

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

function mapMembershipRow(row: MembershipTypeRow, activeMembers: number): MembershipListRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    price: Number(row.price ?? 0),
    currency: row.currency ?? "MXN",
    privileges: row.privileges ?? null,
    allowMultiYear: row.allow_multi_year ?? true,
    maxPrepaidYears: row.max_prepaid_years ?? null,
    isActive: !!row.is_active,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    activeMembers,
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [membershipTypesResp, membershipsResp] = await Promise.all([
    supabaseAdmin
      .from("membership_types")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<MembershipTypeRow[]>(),
    supabaseAdmin
      .from("memberships")
      .select("membership_type_id, status")
      .returns<Pick<MembershipRow, "membership_type_id" | "status">[]>(),
  ]);

  if (membershipTypesResp.error) throw membershipTypesResp.error;
  if (membershipsResp.error) throw membershipsResp.error;

  const membershipTypes = (membershipTypesResp.data ?? []).filter(
    (type) => type.access_type?.toUpperCase() === "MEMBERSHIP"
  );

  const activeMemberships = new Map<string, number>();
  (membershipsResp.data ?? []).forEach((membership) => {
    if (membership.status !== "ACTIVE") return;
    const current = activeMemberships.get(membership.membership_type_id) ?? 0;
    activeMemberships.set(membership.membership_type_id, current + 1);
  });

  const initialMemberships: MembershipListRow[] = membershipTypes.map((type) =>
    mapMembershipRow(type, activeMemberships.get(type.id) ?? 0)
  );

  return { props: { initialMemberships } };
};

export default function MembershipTypesPage({
  initialMemberships,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [rows, setRows] = useState<MembershipListRow[]>(initialMemberships);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MembershipListRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const haystack = `${row.name} ${row.description ?? ""} ${row.privileges ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (row: MembershipListRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      price: row.price.toString(),
      currency: row.currency,
      privileges: row.privileges ?? "",
      allowMultiYear: row.allowMultiYear,
      maxPrepaidYears: row.maxPrepaidYears?.toString() ?? "",
      isActive: row.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setFormLoading(false);
  };

  const handleFormChange =
    <K extends keyof FormState>(field: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value;
      setForm((prev) => ({ ...prev, [field]: value as FormState[K] }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("El nombre es obligatorio");
      return;
    }

    const numericPrice = Number(form.price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFormError("El precio debe ser un numero valido");
      return;
    }

    let parsedMaxYears: number | null = null;
    if (form.maxPrepaidYears.trim()) {
      const candidate = Number(form.maxPrepaidYears);
      if (!Number.isInteger(candidate) || candidate < 1) {
        setFormError("El maximo de anios debe ser un entero positivo");
        return;
      }
      parsedMaxYears = candidate;
    }

    setFormLoading(true);

    const payload = {
      name: trimmedName,
      description: form.description.trim() || null,
      price: numericPrice,
      currency: form.currency.toUpperCase(),
      privileges: form.privileges.trim() || null,
      allowMultiYear: form.allowMultiYear,
      maxPrepaidYears: parsedMaxYears,
      isActive: form.isActive,
    };

    try {
      const endpoint = "/api/membership-annual-types";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo guardar la membresia");
      }

      const updated = body.membershipType as MembershipTypeRow;
      const mapped = mapMembershipRow(updated, rows.find((row) => row.id === updated.id)?.activeMembers ?? 0);

      setRows((prev) => {
        const idx = prev.findIndex((row) => row.id === mapped.id);
        if (idx === -1) return [mapped, ...prev];
        const clone = [...prev];
        clone[idx] = mapped;
        return clone;
      });

      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la membresia";
      setFormError(message);
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const response = await fetch("/api/membership-annual-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo eliminar la membresia");
      }

      setRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteLoading(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la membresia";
      setDeleteError(message);
      setDeleteLoading(false);
    }
  };

  return (
    <AdminLayoutAny title="Tipos de membresia" active="membershipTypes">
      <Head>
        <title>Tipos de membresia  Admin</title>
      </Head>

      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Tipos de membresia</h1>
            <p className="text-sm text-slate-500">
              Gestiona las membresias anuales que permiten comprar planes y acceder a beneficios.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <span className="material-icons-outlined text-base">add</span>
            Nueva membresia
          </button>
        </header>

        <div className="flex items-center justify-end text-xs text-slate-500">
          <Link href="/memberships" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
            <span className="material-icons-outlined text-sm">list</span>
            Administrar planes de clases
          </Link>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o privilegios..."
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 sm:max-w-xs"
            />
            <span className="text-xs text-slate-500">
              {filteredRows.length} tipos  {filteredRows.length === 1 ? "disponible" : "disponibles"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Nombre</th>
                  <th className="px-6 py-3">Precio</th>
                  <th className="px-6 py-3">Multi-anual</th>
                  <th className="px-6 py-3">Privilegios</th>
                  <th className="px-6 py-3 text-center">Miembros activos</th>
                  <th className="px-6 py-3">Actualizacion</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                      No hay registros que coincidan con la busqueda.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-6 py-4 align-top">
                        <div className="font-semibold text-slate-800">{row.name}</div>
                        {row.description && (
                          <div className="mt-1 text-xs text-slate-500">{row.description}</div>
                        )}
                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {row.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-6 py-4 align-top">
                        {getCurrencyFormatter(row.currency).format(row.price)}{" "}
                        <span className="text-xs text-slate-500">/anual</span>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="font-medium">
                          {row.allowMultiYear ? "Permite prepago" : "Solo 1 anio"}
                        </div>
                        {row.allowMultiYear && row.maxPrepaidYears && (
                          <div className="text-xs text-slate-500">Hasta {row.maxPrepaidYears} anios</div>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top text-xs text-slate-600">
                        {row.privileges ? row.privileges : "Sin privilegios registrados"}
                      </td>
                      <td className="px-6 py-4 align-top text-center text-sm text-slate-700">
                        {row.activeMembers}
                      </td>
                      <td className="px-6 py-4 align-top text-xs text-slate-500">
                        {row.updatedAt ? dayjs(row.updatedAt).format("DD MMM YYYY HH:mm") : "-"}
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <span className="material-icons-outlined text-sm">edit</span>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            disabled={row.activeMembers > 0}
                          >
                            <span className="material-icons-outlined text-sm">delete</span>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleSubmit}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">
                    {editingId ? "Editar membresia" : "Nueva membresia"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Define cuanto cuesta la membresia anual y sus privilegios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Cerrar"
                >
                  <span className="material-icons-outlined text-base">close</span>
                </button>
              </div>

              <div className="space-y-4 px-6 py-6 text-sm">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Nombre</span>
                  <input
                    value={form.name}
                    onChange={handleFormChange("name")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    placeholder="Membresia anual premium"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Descripcion</span>
                  <textarea
                    value={form.description}
                    onChange={handleFormChange("description")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    rows={2}
                    placeholder="Notas internas o beneficios generales"
                  />
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Precio anual</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={handleFormChange("price")}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Moneda</span>
                    <input
                      value={form.currency}
                      onChange={handleFormChange("currency")}
                      maxLength={3}
                      className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Privilegios</span>
                  <textarea
                    value={form.privileges}
                    onChange={handleFormChange("privileges")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    rows={3}
                    placeholder="Ejemplo: 10% descuento en planes grupales, acceso prioritario a eventos"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={form.allowMultiYear}
                      onChange={handleFormChange("allowMultiYear")}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Permitir pago por varios anios
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Maximo de anios</span>
                    <input
                      type="number"
                      min="1"
                      value={form.maxPrepaidYears}
                      onChange={handleFormChange("maxPrepaidYears")}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      placeholder={form.allowMultiYear ? "Libre" : "1"}
                      disabled={!form.allowMultiYear}
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={handleFormChange("isActive")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Mostrar como disponible
                </label>
                {formError && <p className="text-sm text-rose-600">{formError}</p>}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                >
                  {formLoading ? "Guardando..." : editingId ? "Guardar cambios" : "Crear membresia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-800">Eliminar membresia</h3>
            </div>
            <div className="space-y-3 px-6 py-6 text-sm text-slate-600">
              <p>
                Estas a punto de eliminar <strong>{deleteTarget.name}</strong>. Esta accion es permanente y
                solo es posible si no tiene miembros activos asociados.
              </p>
              {deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                  setDeleteLoading(false);
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                disabled={deleteLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                disabled={deleteLoading}
              >
                {deleteLoading ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayoutAny>
  );
}

function getCurrencyFormatter(currency: string) {
  if (currencyFormatter.resolvedOptions().currency === currency.toUpperCase()) return currencyFormatter;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
}
