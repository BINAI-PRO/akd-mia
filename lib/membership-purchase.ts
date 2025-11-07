import { madridDayjs } from "@/lib/timezone";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type MembershipTypeRow = Pick<
  Tables<"membership_types">,
  "id" | "name" | "price" | "currency" | "allow_multi_year" | "max_prepaid_years" | "privileges"
>;

type ClientRow = Pick<Tables<"clients">, "id" | "full_name" | "email">;

export type MembershipPurchasePayload = {
  clientId: string;
  membershipTypeId: string;
  startDate?: string | null;
  termYears?: number | string | null;
  notes?: string | null;
};

export type MembershipPurchasePrepared = {
  client: ClientRow;
  membershipType: MembershipTypeRow;
  startIso: string;
  endIso: string;
  termYears: number;
  amount: number;
  currency: string;
  notes: string | null;
};

export type MembershipPaymentPayload = {
  status: "SUCCESS" | "FAILED" | "REFUNDED" | "PENDING";
  providerRef?: string | null;
  notes?: string | null;
  paidAt?: string | null;
};

type MemberSnapshot = Tables<"clients"> & {
  client_profiles: Tables<"client_profiles"> | null;
  memberships: Array<
    Tables<"memberships"> & {
      membership_types: Pick<Tables<"membership_types">, "name" | "privileges"> | null;
      membership_payments: Array<
        Pick<
          Tables<"membership_payments">,
          "amount" | "currency" | "paid_at" | "period_start" | "period_end" | "period_years"
        >
      >;
    }
  > | null;
  plan_purchases: Array<
    Tables<"plan_purchases"> & {
      plan_types: Pick<Tables<"plan_types">, "name" | "privileges"> | null;
    }
  > | null;
};

function parseTermYears(value: MembershipPurchasePayload["termYears"]): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(1, Math.round(parsed));
}

async function fetchMembershipType(id: string): Promise<MembershipTypeRow> {
  const { data, error } = await supabaseAdmin
    .from("membership_types")
    .select("id, name, price, currency, privileges, allow_multi_year, max_prepaid_years")
    .eq("id", id)
    .maybeSingle<MembershipTypeRow>();

  if (error || !data) {
    throw Object.assign(new Error("El tipo de membresía seleccionado no existe"), { status: 400 });
  }

  return data;
}

async function fetchClient(id: string): Promise<ClientRow> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email")
    .eq("id", id)
    .maybeSingle<ClientRow>();

  if (error || !data) {
    throw Object.assign(new Error("No se encontro al cliente seleccionado"), { status: 400 });
  }

  return data;
}

export async function prepareMembershipPurchase(
  payload: MembershipPurchasePayload
): Promise<MembershipPurchasePrepared> {
  const { clientId, membershipTypeId, startDate, notes } = payload;

  if (!clientId || !membershipTypeId) {
    throw Object.assign(new Error("Cliente y tipo de membresía son obligatorios"), { status: 400 });
  }

  const [membershipType, client] = await Promise.all([
    fetchMembershipType(membershipTypeId),
    fetchClient(clientId),
  ]);

  const pricePerYear = Number(membershipType.price ?? 0);
  if (!Number.isFinite(pricePerYear) || pricePerYear < 0) {
    throw Object.assign(new Error("El tipo de membresía no tiene un precio valido"), { status: 400 });
  }

  const termYears = parseTermYears(payload.termYears);

  if (membershipType.max_prepaid_years && termYears > membershipType.max_prepaid_years) {
    throw Object.assign(
      new Error(`Esta membresía admite hasta ${membershipType.max_prepaid_years} anos por pago`),
      { status: 400 }
    );
  }

  if (!membershipType.allow_multi_year && termYears > 1) {
    throw Object.assign(new Error("Esta membresía solo permite pagar un ano a la vez"), {
      status: 400,
    });
  }

  const start = startDate ? madridDayjs(startDate, true) : madridDayjs();
  if (!start.isValid()) {
    throw Object.assign(new Error("Fecha de inicio invalida"), { status: 400 });
  }

  const startOfDay = start.startOf("day");
  const endOfPeriod = startOfDay.add(termYears, "year").subtract(1, "day");

  const amount = Number(pricePerYear * termYears);
  const currency = (membershipType.currency ?? "MXN").toUpperCase();

  return {
    client,
    membershipType,
    startIso: startOfDay.format("YYYY-MM-DD"),
    endIso: endOfPeriod.format("YYYY-MM-DD"),
    termYears,
    amount,
    currency,
    notes: notes ? notes.trim() || null : null,
  };
}

async function fetchMemberSnapshot(clientId: string): Promise<MemberSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select(
      `
      *,
      client_profiles ( * ),
      memberships (
        *,
        membership_types ( name, privileges ),
        membership_payments ( amount, currency, paid_at, period_start, period_end, period_years )
      ),
      plan_purchases (
        *,
        plan_types ( name, privileges )
      )
    `
    )
    .eq("id", clientId)
    .maybeSingle<MemberSnapshot>();

  if (error || !data) {
    throw Object.assign(new Error("La membresía se registro, pero no pudimos refrescar la informacion"), {
      status: 500,
    });
  }

  return data;
}

export async function commitMembershipPurchase(
  prepared: MembershipPurchasePrepared,
  payment: MembershipPaymentPayload,
  options?: { includeSnapshot?: boolean }
): Promise<{ membershipId: string; memberSnapshot: MemberSnapshot | null }> {
  const includeSnapshot = options?.includeSnapshot ?? false;
  const providerRef = payment.providerRef?.trim();

  if (providerRef) {
    const { data: existing } = await supabaseAdmin
      .from("membership_payments")
      .select("id, membership_id, memberships ( client_id )")
      .eq("provider_ref", providerRef)
      .maybeSingle<{
        id: string;
        membership_id: string;
        memberships: { client_id: string } | null;
      }>();

    if (existing?.membership_id) {
      const snapshot =
        includeSnapshot && existing.memberships?.client_id
          ? await fetchMemberSnapshot(existing.memberships.client_id)
          : null;
      return { membershipId: existing.membership_id, memberSnapshot: snapshot };
    }
  }

  await supabaseAdmin
    .from("memberships")
    .update({ status: "INACTIVE" })
    .eq("client_id", prepared.client.id)
    .eq("status", "ACTIVE");

  const { data: membershipInsert, error: membershipInsertError } = await supabaseAdmin
    .from("memberships")
    .insert({
      client_id: prepared.client.id,
      membership_type_id: prepared.membershipType.id,
      status: payment.status === "SUCCESS" ? "ACTIVE" : payment.status,
      start_date: prepared.startIso,
      end_date: prepared.endIso,
      next_billing_date: prepared.endIso,
      auto_renew: false,
      remaining_classes: null,
      notes: prepared.notes,
      term_years: prepared.termYears,
      privileges_snapshot: prepared.membershipType.privileges ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (membershipInsertError || !membershipInsert) {
    throw Object.assign(new Error("No se pudo registrar la membresía"), { status: 500 });
  }

  const { error: paymentError } = await supabaseAdmin.from("membership_payments").insert({
    membership_id: membershipInsert.id,
    amount: prepared.amount,
    currency: prepared.currency,
    paid_at: payment.paidAt ?? madridDayjs().toISOString(),
    period_start: prepared.startIso,
    period_end: prepared.endIso,
    period_years: prepared.termYears,
    status: payment.status,
    notes: payment.notes ?? null,
    provider_ref: providerRef ?? null,
  });

  if (paymentError) {
    throw Object.assign(new Error("La membresía se registro, pero el pago no se guardo correctamente"), {
      status: 500,
    });
  }

  await supabaseAdmin.from("client_profiles").update({ status: "ACTIVE" }).eq("client_id", prepared.client.id);

  const snapshot = includeSnapshot ? await fetchMemberSnapshot(prepared.client.id) : null;

  return {
    membershipId: membershipInsert.id,
    memberSnapshot: snapshot,
  };
}
