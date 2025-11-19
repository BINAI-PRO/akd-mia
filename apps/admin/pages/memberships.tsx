import Head from "next/head";


import Link from "next/link";


import dayjs from "dayjs";


import {


  useMemo,


  useState,


  type ComponentType,


  type PropsWithChildren,


} from "react";


import type {


  GetServerSideProps,


  InferGetServerSidePropsType,


} from "next";


import AdminLayout from "@/components/admin/AdminLayout";


import { MembershipsDisabledNotice } from "@/components/admin/MembershipsDisabledNotice";


import { useMembershipsEnabled } from "@/components/StudioTimezoneContext";


import { supabaseAdmin } from "@/lib/supabase-admin";


import type { Tables } from "@/types/database";


import { useAdminAccess } from "@/hooks/useAdminAccess";


import type { AdminFeatureKey } from "@/lib/admin-access";





// Bridge tipado por si AdminLayout exige props particulares


const AdminLayoutAny = AdminLayout as unknown as ComponentType<


  PropsWithChildren<Record<string, unknown>>


>;





// ================= Tipos UI =================


const FALLBACK_PLAN_CATEGORIES = ["Grupal", "Privada", "Semi-Privada", "Promoción", "Evento"];





async function loadEnumOptions(enumName: string, fallback: string[]): Promise<string[]> {


  try {


    const { data, error } = await supabaseAdmin.rpc("enum_values", {


      enum_name: enumName,


      schema_name: "public",


    });


    if (error) throw error;


    if (!Array.isArray(data)) throw new Error("Respuesta invalida");


    const values = (data as string[])


      .map((value) => (typeof value === "string" ? value.trim() : ""))


      .filter((value) => value.length > 0);


    if (values.length === 0) throw new Error("Enum sin valores");


    return values;


  } catch (error) {


    return [...fallback];


  }


}





// Usamos espanol en la UI, pero alineamos los valores a la DB en SSR


export type PlanEstatus = "Activo" | "Inactivo";





export type PlanListRow = {


  id: string;


  name: string;


  description: string | null;


  price: number;


  currency: string;


  classCount: number | null;


  validityDays: number | null;


  privileges: string | null;


  status: PlanEstatus;


  activePurchases: number;


  updatedAt: string | null;


  category: string;


  appOnly: boolean;


  requiresMembership: boolean;


};





type PlanTypeRow = Tables<"plan_types">;


type PlanPurchaseRow = Pick<Tables<"plan_purchases">, "plan_type_id" | "status">;





export type PageProps = {


  initialPlanes: PlanListRow[];


  categoryOptions: string[];


};





// ================= Helpers =================


const CURRENCY_CACHE: Record<string, Intl.NumberFormat> = {};


function formatCurrency(value: number, currency: string) {


  const key = (currency || "MXN").toUpperCase();


  if (!CURRENCY_CACHE[key]) {


    CURRENCY_CACHE[key] = new Intl.NumberFormat("en-US", {


      style: "currency",


      currency: key,


      maximumFractionDigits: 2,


    });


  }


  return CURRENCY_CACHE[key].format(value);


}





function mapPlan(row: PlanTypeRow, activeCount: number): PlanListRow {


  return {


    id: row.id,


    name: row.name,


    description: row.description ?? null,


    price: Number(row.price ?? 0),


    currency: row.currency ?? "MXN",


    classCount: row.class_count === null ? null : Number(row.class_count ?? 0),


    validityDays: row.validity_days ?? null,


    privileges: row.privileges ?? null,


    status: row.is_active ? "Activo" : "Inactivo",


    activePurchases: activeCount,


    updatedAt: row.updated_at ?? row.created_at ?? null,


    category: row.category,


    appOnly: Boolean(row.app_only),


    requiresMembership: row.mem_req ?? true,


  };


}





// ================= SSR =================


export const getServerSideProps: GetServerSideProps<PageProps> = async () => {


  const [planTypesResp, planPurchasesResp, categoryOptions] = await Promise.all([


    supabaseAdmin


      .from("plan_types")


      .select(


        `id, name, description, price, currency, class_count, validity_days, privileges, is_active, updated_at, created_at, category, app_only, mem_req`


      )


      .order("created_at", { ascending: false })


      .returns<PlanTypeRow[]>(),


    supabaseAdmin


      .from("plan_purchases")


      .select("plan_type_id, status")


      .returns<PlanPurchaseRow[]>(),


    loadEnumOptions("category", FALLBACK_PLAN_CATEGORIES),


  ]);





  if (planTypesResp.error) throw planTypesResp.error;


  if (planPurchasesResp.error) throw planPurchasesResp.error;





  const activeCounts = new Map<string, number>();


  (planPurchasesResp.data ?? []).forEach((purchase) => {


    if (!purchase.plan_type_id) return;


    if (purchase.status?.toUpperCase() !== "ACTIVE") return;


    const current = activeCounts.get(purchase.plan_type_id) ?? 0;


    activeCounts.set(purchase.plan_type_id, current + 1);


  });





  const initialPlanes: PlanListRow[] = (planTypesResp.data ?? []).map((row) =>


    mapPlan(row, activeCounts.get(row.id) ?? 0)


  );





  return { props: { initialPlanes, categoryOptions } };


};





// ================= Page =================


export default function AdminMembershipsPage(


  { initialPlanes, categoryOptions }: InferGetServerSidePropsType<typeof getServerSideProps>


) {


  const [plans, setPlans] = useState<PlanListRow[]>(initialPlanes);


  const [statusFilter, setStatusFilter] = useState<"all" | PlanEstatus>("all");


  const [message, setMessage] = useState<string | null>(null);


  const [error, setError] = useState<string | null>(null);


  const [saving, setSaving] = useState(false);


  const featureKey: AdminFeatureKey = "membershipPlans";


  const pageAccess = useAdminAccess(featureKey);


  const readOnly = !pageAccess.canEdit;


  const membershipsEnabled = useMembershipsEnabled();





  type FormState = {


    name: string;


    description: string;


    price: string;


    currency: string;


    classCount: string;


    validityDays: string;


    privileges: string;


    isActive: boolean;


    category: string;


    appOnly: boolean;


    requiresMembership: boolean;


  };





  const DEFAULT_FORM: FormState = {


    name: "",


    description: "",


    price: "",


    currency: "MXN",


    classCount: "",


    validityDays: "",


    privileges: "",


    isActive: true,


    category: categoryOptions[0] ?? "",


    appOnly: false,


    requiresMembership: true,


  };





  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);





  const filteredPlanes = useMemo(() => {


    if (statusFilter === "all") return plans;


    return plans.filter((plan) => plan.status === statusFilter);


  }, [plans, statusFilter]);





  const handleChange = <K extends keyof FormState>(key: K) =>


    (


      event:


        | React.ChangeEvent<HTMLInputElement>


        | React.ChangeEvent<HTMLSelectElement>


        | React.ChangeEvent<HTMLTextAreaElement>


    ) => {


      const element = event.target;


      let value: FormState[K];


      if (element instanceof HTMLInputElement && element.type === "checkbox") {


        value = element.checked as FormState[K];


      } else if (


        element instanceof HTMLInputElement ||


        element instanceof HTMLSelectElement ||


        element instanceof HTMLTextAreaElement


      ) {


        value = element.value as FormState[K];


      } else {


        return;


      }


      setFormState((prev) => ({ ...prev, [key]: value }));


    };





  function resetForm() {


    setFormState(DEFAULT_FORM);


    setMessage(null);


    setError(null);


  }





  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {


    e.preventDefault();


    if (readOnly) {


      setError("Tu rol no tiene permisos para crear o editar planes.");


      return;


    }


    setSaving(true);


    setMessage(null);


    setError(null);





    try {


      if (!formState.name.trim()) throw new Error("El nombre es obligatorio");





      const numericPrice = formState.price ? Number(formState.price) : 0;


      if (!Number.isFinite(numericPrice) || numericPrice < 0)


        throw new Error("El precio debe ser un número positivo");





      let classCountValue: number | null = null;


      if (formState.classCount.trim()) {


        const parsed = Number(formState.classCount);


        if (!Number.isInteger(parsed) || parsed <= 0) {


          throw new Error("El número de sesiónes debe ser un entero positivo o deja el campo vacío para plan ilimitado");


        }


        classCountValue = parsed;


      }





      let validityDaysValue: number | null = null;


      if (formState.validityDays.trim()) {


        const candidate = Number(formState.validityDays);


        if (!Number.isInteger(candidate) || candidate <= 0) {


          throw new Error("La vigencia debe ser un entero positivo");


        }


        validityDaysValue = candidate;


      }





      const trimmedCategory = formState.category.trim();


      if (!trimmedCategory) {


        throw new Error("Debes seleccionar una categoría");


      }





      const payload = {


        name: formState.name.trim(),


        description: formState.description.trim() || null,


        price: numericPrice,


        currency: formState.currency.toUpperCase(),


        classCount: classCountValue,


        validityDays: validityDaysValue,


        privileges: formState.privileges.trim() || null,


        isActive: formState.isActive,


        category: trimmedCategory,


        appOnly: formState.appOnly,


        memReq: formState.requiresMembership,


      };





      const res = await fetch("/api/plan-types", {


        method: "POST",


        headers: { "Content-Type": "application/json" },


        body: JSON.stringify(payload),


      });


      if (!res.ok) {


        const body = await res.json().catch(() => ({}));


        throw new Error(body.error || "No se pudo crear el plan");


      }


      const body = await res.json();


      const inserted = body.planType ?? body.data ?? body;


      const newRow = mapPlan(inserted, 0);


      setPlans((prev) => [newRow, ...prev]);


      setMessage("Plan creado correctamente");


      resetForm();


    } catch (err: unknown) {


      const message = err instanceof Error ? err.message : "No se pudo crear el plan";


      setError(message);


    } finally {


      setSaving(false);


    }


  }





  async function togglePlanEstatus(plan: PlanListRow) {


    if (readOnly) {


      setError("Tu rol no puede modificar el estado de los planes.");


      return;


    }


    try {


      const res = await fetch("/api/plan-types", {


        method: "PATCH",


        headers: { "Content-Type": "application/json" },


        body: JSON.stringify({ id: plan.id, isActive: plan.status !== "Activo" }),


      });


      if (!res.ok) {


        const body = await res.json().catch(() => ({}));


        throw new Error(body.error || "No se pudo actualizar el plan");


      }


      const body = await res.json();


      const updated = mapPlan(body.planType ?? body.data ?? body, plan.activePurchases);


      setPlans((prev) =>


        prev.map((p) => (p.id === updated.id ? { ...updated, activePurchases: plan.activePurchases } : p))


      );


    } catch (err: unknown) {


      const message = err instanceof Error ? err.message : "No se pudo actualizar el plan";


      setError(message);


    }


  }





  const headerToolbar = (


    <div className="flex items-center gap-3">


      <select


        value={statusFilter}


        onChange={(event) => {


          const value = event.target.value;


          if (value === "all" || value === "Activo" || value === "Inactivo") {


            setStatusFilter(value);


          }


        }}


        className="h-10 rounded-md border border-slate-200 px-3 text-sm"


      >


        <option value="all">Todos los planes</option>


        <option value="Activo">Activo</option>


        <option value="Inactivo">Inactivo</option>


      </select>


      <Link


        href="/membership-types"


        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"


      >


        <span className="material-icons-outlined text-sm">workspace_premium</span>


        Tipos de membresía


      </Link>


    </div>


  );





  if (!membershipsEnabled) {


    return (


      <AdminLayoutAny title="Planes de membresía" active="membershipPlans" featureKey={featureKey}>


        <Head>


          <title>Planes | Admin</title>


        </Head>


        <MembershipsDisabledNotice />


      </AdminLayoutAny>


    );


  }





  return (


    <AdminLayoutAny


      title="Planes de membresía"


      active="membershipPlans"


      headerToolbar={headerToolbar}


      featureKey="membershipPlans"


    >


      <Head>


        <title>Planes  Admin</title>


      </Head>


      {readOnly && (


        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">


          Tu rol solo permite consulta en este módulo. No podrás crear ni editar planes.


        </div>


      )}





      <div className="mx-auto flex max-w-7xl flex-col gap-6">


        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">


          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">


            <div>


              <h2 className="text-xl font-semibold text-slate-800">Planes</h2>


              <p className="text-sm text-slate-500">


                Controla precio, categoría, vigencia y restricciones de cada plan.


              </p>


            </div>


            <div className="flex items-center gap-3 text-sm text-slate-500">


              <span>Total planes: {plans.length}</span>


            </div>


          </div>





          <div className="overflow-x-auto">


            <table className="w-full text-left text-sm">


              <thead className="bg-slate-50 text-xs uppercase text-slate-500">


                <tr>


                  <th className="px-6 py-3">Plan</th>


                  <th className="px-6 py-3">Precio</th>


                  <th className="px-6 py-3">Accesos</th>


                  <th className="px-6 py-3">Miembros</th>


                  <th className="px-6 py-3">Estado</th>


                  <th className="px-6 py-3 text-right">Actualizado</th>


                </tr>


              </thead>


              <tbody>


                {filteredPlanes.length === 0 ? (


                  <tr>


                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">


                      No hay planes que coincidan con los filtros.


                    </td>


                  </tr>


                ) : (


                  filteredPlanes.map((plan) => {


                    const detailTokens = [


                      plan.classCount === null ? "Ilimitado" : `${plan.classCount} sesiónes`,


                      plan.validityDays ? `${plan.validityDays} días de vigencia` : null,


                      `Categoría: ${plan.category}`,


                      plan.appOnly ? "Solo app" : null,


                      plan.requiresMembership ? "Requiere membresía" : "Compra sin membresía",


                    ].filter((token): token is string => Boolean(token));





                    return (


                      <tr key={plan.id} className="border-t border-slate-200 hover:bg-slate-50">


                        <td className="px-6 py-4">


                          <p className="font-medium text-slate-800">{plan.name}</p>


                          <p className="text-xs text-slate-500">{plan.description ?? "Sin descripcion"}</p>


                          {plan.privileges ? (


                            <p className="mt-1 text-xs text-slate-400">Privilegios: {plan.privileges}</p>


                          ) : null}


                        </td>


                        <td className="px-6 py-4 text-slate-700">


                          {plan.price ? formatCurrency(plan.price, plan.currency) : "Gratis"}


                        </td>


                        <td className="px-6 py-4 text-slate-700">


                          {detailTokens.length > 0 ? detailTokens.join(" | ") : "Configuracion pendiente"}


                        </td>


                        <td className="px-6 py-4 text-slate-700">{plan.activePurchases}</td>


                        <td className="px-6 py-4">


                          <div className="flex items-center gap-3">


                            {plan.status === "Activo" ? (


                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">


                                Activo


                              </span>


                            ) : (


                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">


                                Inactivo


                              </span>


                            )}


                            <label


                              className={`relative inline-flex items-center ${


                                readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"


                              }`}


                            >


                              <input


                                type="checkbox"


                                className="peer sr-only"


                                checked={plan.status === "Activo"}


                                onChange={() => togglePlanEstatus(plan)}


                                disabled={readOnly}


                                aria-disabled={readOnly}


                              />


                              <div className="h-5 w-10 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />


                              <span className="absolute left-0 top-0 ml-1 mt-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />


                            </label>


                          </div>


                        </td>


                        <td className="px-6 py-4 text-right text-xs text-slate-500">


                          {plan.updatedAt ? dayjs(plan.updatedAt).format("DD MMM YYYY") : "N/A"}


                        </td>


                      </tr>


                    );


                  })


                )}


              </tbody>


            </table>


          </div>


        </section>





        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">


          <h3 className="text-xl font-semibold">Crear plan</h3>


          <p className="mt-1 text-xs text-slate-500">


            Define precio, vigencia, categoría y si el plan es ilimitado o exclusivo para reservas desde la app.


          </p>


          <form className="mt-4" onSubmit={handleSubmit}>


            <fieldset className="space-y-4" disabled={readOnly || saving}>


            <div>


              <label className="block text-sm font-medium text-slate-600">Nombre del plan</label>


              <input


                value={formState.name}


                onChange={handleChange("name")}


                placeholder="p. ej., Paquete 10 sesiónes"


                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


              />


            </div>


            <div>


              <label className="block text-sm font-medium text-slate-600">Descripcion</label>


              <textarea


                value={formState.description}


                onChange={handleChange("description")}


                placeholder="Incluye detalles del plan"


                rows={3}


                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


              />


            </div>


            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">


              <div>


                <label className="block text-sm font-medium text-slate-600">Precio</label>


                <div className="flex gap-2">


                  <input


                    value={formState.price}


                    onChange={handleChange("price")}


                    placeholder="120.00"


                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


                  />


                  <select


                    value={formState.currency}


                    onChange={handleChange("currency")}


                    className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm"


                  >


                    {(["MXN", "USD", "EUR"] as const).map((cur) => (


                      <option key={cur} value={cur}>


                        {cur}


                      </option>


                    ))}


                  </select>


                </div>


              </div>


              <div>


                <label className="block text-sm font-medium text-slate-600">Sesiónes incluidas</label>


                <input


                  value={formState.classCount}


                  onChange={handleChange("classCount")}


                  placeholder="Ej. 10"


                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


                />


                <p className="mt-1 text-xs text-slate-400">Deja el campo vacio para un plan ilimitado.</p>


              </div>


            </div>


            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">


              <div>


                <label className="block text-sm font-medium text-slate-600">Categoría</label>


                <select


                  value={formState.category}


                  onChange={handleChange("category")}


                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


                >


                  {categoryOptions.map((option) => (


                    <option key={option} value={option}>


                      {option}


                    </option>


                  ))}


                </select>


              </div>


              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">


                <div>


                  <span className="font-medium text-slate-600">Solo desde la app</span>


                  <p className="text-xs text-slate-500">La recepción no podra reservar con este plan.</p>


                </div>


                <label className="relative inline-flex cursor-pointer items-center">


                  <input


                    type="checkbox"


                    className="peer sr-only"


                    checked={formState.appOnly}


                    onChange={handleChange("appOnly")}


                  />


                  <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />


                  <span className="absolute left-0 top-0 ml-1 mt-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />


                </label>


              </div>


              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">


                <div>


                  <span className="font-medium text-slate-600">Requiere membresía activa</span>


                  <p className="text-xs text-slate-500">Desactivalo para permitir la compra sin membresía anual.</p>


                </div>


                <label className="relative inline-flex cursor-pointer items-center">


                  <input


                    type="checkbox"


                    className="peer sr-only"


                    checked={formState.requiresMembership}


                    onChange={handleChange("requiresMembership")}


                  />


                  <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />


                  <span className="absolute left-0 top-0 ml-1 mt-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />


                </label>


              </div>


            </div>


            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">


              <div>


                <label className="block text-sm font-medium text-slate-600">Vigencia (días)</label>


                <input


                  value={formState.validityDays}


                  onChange={handleChange("validityDays")}


                  placeholder="Opcional"


                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


                />


              </div>


              <div>


                <label className="block text-sm font-medium text-slate-600">Privilegios</label>


                <textarea


                  value={formState.privileges}


                  onChange={handleChange("privileges")}


                  placeholder="Beneficios o notas del plan"


                  rows={3}


                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"


                />


              </div>


            </div>


            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">


              <span className="font-medium text-slate-600">Activo</span>


              <label className="relative inline-flex cursor-pointer items-center">


                <input


                  type="checkbox"


                  className="peer sr-only"


                  checked={formState.isActive}


                  onChange={handleChange("isActive")}


                />


                <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />


                <span className="absolute left-0 top-0 ml-1 mt-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />


              </label>


            </div>


            {message && <p className="text-sm text-emerald-600">{message}</p>}


            {error && <p className="text-sm text-rose-600">{error}</p>}


            <div className="flex justify-end gap-3 pt-2">


              <button


                type="button"


                onClick={resetForm}


                className="rounded-md border border-slate-200 px-4 py-2 text-sm"


              >


                Limpiar


              </button>


              <button


                type="submit"


                disabled={saving}


                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"


              >


                {saving ? "Guardando..." : "Guardar plan"}


              </button>


            </div>


            </fieldset>


          </form>


        </section>


      </div>


    </AdminLayoutAny>


  );


}






















