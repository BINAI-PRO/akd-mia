import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

export class ClientLinkConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientLinkConflictError";
  }
}

type ClientRowMinimal = Pick<
  Tables<"clients">,
  "id" | "auth_user_id" | "email" | "full_name" | "phone"
>;

type EnsureClientParams = {
  authUserId: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
};

const CLIENT_SELECT = "id, auth_user_id, email, full_name, phone";

function escapeForILike(value: string) {
  return value.replace(/([%_\\])/g, "\\$1");
}

async function fetchByAuthUserId(
  authUserId: string
): Promise<ClientRowMinimal | null> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select<ClientRowMinimal>(CLIENT_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup client by auth_user_id: ${error.message}`);
  }

  if (data) {
    if (!data.auth_user_id) {
      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update({ auth_user_id: authUserId })
        .eq("id", data.id);

      if (updateError) {
        throw new Error(
          `Failed to backfill auth_user_id for client ${data.id}: ${updateError.message}`
        );
      }

      return { ...data, auth_user_id: authUserId };
    }

    return data;
  }

  return null;
}

async function fetchByEmail(
  email: string
): Promise<ClientRowMinimal | null> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select<ClientRowMinimal>(CLIENT_SELECT)
    .ilike("email", escapeForILike(email))
    .limit(2);

  if (error) {
    throw new Error(`Failed to lookup client by email: ${error.message}`);
  }

  if (!data || data.length === 0) return null;

  if (data.length > 1) {
    throw new ClientLinkConflictError(
      "Multiple client records share the same email; link manually to continue."
    );
  }

  return data[0];
}

async function fetchByPhone(
  phone: string
): Promise<ClientRowMinimal | null> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select<ClientRowMinimal>(CLIENT_SELECT)
    .eq("phone", phone)
    .limit(2);

  if (error) {
    throw new Error(`Failed to lookup client by phone: ${error.message}`);
  }

  if (!data || data.length === 0) return null;
  if (data.length > 1) return null;
  return data[0];
}

export async function ensureClientForAuthUser({
  authUserId,
  email,
  fullName,
  phone,
}: EnsureClientParams): Promise<ClientRowMinimal | null> {
  const existing = await fetchByAuthUserId(authUserId);
  if (existing) return existing;

  const trimmedEmail = email?.trim() ?? null;
  const rawPhone = phone?.toString().trim() ?? null;
  const trimmedPhone = rawPhone && rawPhone.length > 0 ? rawPhone : null;
  const trimmedFullName = fullName?.trim() ?? null;

  if (trimmedEmail) {
    const byEmail = await fetchByEmail(trimmedEmail);
    if (byEmail) {
      if (byEmail.auth_user_id && byEmail.auth_user_id !== authUserId) {
        throw new ClientLinkConflictError(
          "Email already linked to another auth user; resolve conflict before proceeding."
        );
      }

      const { error: linkError } = await supabaseAdmin
        .from("clients")
        .update({
          auth_user_id: authUserId,
          email: byEmail.email ?? trimmedEmail,
        })
        .eq("id", byEmail.id);

      if (linkError) {
        throw new Error(
          `Failed to link auth user to existing client: ${linkError.message}`
        );
      }

      return { ...byEmail, auth_user_id: authUserId, email: byEmail.email ?? trimmedEmail };
    }
  }

  if (trimmedPhone) {
    const byPhone = await fetchByPhone(trimmedPhone).catch(() => null);
    if (byPhone && !byPhone.auth_user_id) {
      const { error: linkError } = await supabaseAdmin
        .from("clients")
        .update({ auth_user_id: authUserId })
        .eq("id", byPhone.id);

      if (linkError) {
        throw new Error(
          `Failed to link auth user to existing client: ${linkError.message}`
        );
      }

      return { ...byPhone, auth_user_id: authUserId };
    }
  }

  const newClient: Partial<Tables<"clients">> = {
    auth_user_id: authUserId,
    email: trimmedEmail ?? null,
    phone: trimmedPhone ?? "",
    full_name:
      trimmedFullName ??
      (trimmedEmail ? trimmedEmail.split("@")[0] : null) ??
      "Cliente",
  };

  const { data: created, error: insertError } = await supabaseAdmin
    .from("clients")
    .insert(newClient)
    .select<ClientRowMinimal>(CLIENT_SELECT)
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create client for auth user: ${insertError.message}`);
  }

  return created ?? null;
}
