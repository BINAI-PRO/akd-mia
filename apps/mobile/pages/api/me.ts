import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import type { Tables } from "@/types/database";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";
import { normalizePhoneInput } from "@/lib/phone";
import type { StudioPhoneCountry } from "@/lib/studio-settings-shared";

type ClientRow = Tables<"clients"> & {
  client_profiles?: Pick<Tables<"client_profiles">, "avatar_url" | "status"> | null;
};

type MeResponse = {
  profile: {
    authUserId: string;
    clientId: string | null;
    fullName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    status: string | null;
    role: string | null;
    isAdmin: boolean;
  };
};

type ErrorResponse = { error: string };

const ALLOWED_METHODS = new Set(["GET", "PATCH"]);

function extractMetadata(entry: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  email?: string | null;
}) {
  const metadata = (entry.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (entry.app_metadata ?? {}) as Record<string, unknown>;

  const fullName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (metadata.display_name as string | undefined) ??
    entry.email?.split("@")[0] ??
    "Usuario";

  const avatarUrl =
    (metadata.avatar_url as string | undefined) ??
    (metadata.avatar as string | undefined) ??
    null;

  const phone = (metadata.phone as string | undefined) ?? null;
  const role =
    (metadata.role as string | undefined) ??
    (appMetadata.role as string | undefined) ??
    null;

  const isAdmin =
    Boolean(appMetadata.is_admin ?? metadata.is_admin ?? metadata.admin) ||
    role === "admin";

  return { fullName, avatarUrl, phone, role, isAdmin };
}

function shapeProfile(params: {
  authUserId: string;
  client: ClientRow | null;
  fallback: {
    fullName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    role: string | null;
    isAdmin: boolean;
  };
}): MeResponse {
  const { authUserId, client, fallback } = params;

  return {
    profile: {
      authUserId,
      clientId: client?.id ?? null,
      fullName: client?.full_name ?? fallback.fullName,
      email: client?.email ?? fallback.email,
      phone: client?.phone ?? fallback.phone,
      avatarUrl: client?.client_profiles?.avatar_url ?? fallback.avatarUrl,
      status: client?.client_profiles?.status ?? null,
      role: fallback.role,
      isAdmin: fallback.isAdmin,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse | ErrorResponse>
) {
  const method = req.method ?? "";
  if (!ALLOWED_METHODS.has(method)) {
    res.setHeader("Allow", "GET,PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    if (isRefreshTokenMissingError(sessionError)) {
      await supabase.auth.signOut();
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.status(500).json({ error: sessionError.message });
  }

  if (!session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const baseMetadata = extractMetadata(session.user);
  const fallback = {
    fullName: baseMetadata.fullName,
    email: session.user.email ?? null,
    phone: baseMetadata.phone,
    avatarUrl: baseMetadata.avatarUrl,
    role: baseMetadata.role,
    isAdmin: baseMetadata.isAdmin,
  };

  const fetchClient = async (): Promise<ClientRow | null> => {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, phone, client_profiles ( avatar_url, status )")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as ClientRow | null;
  };

  let profile: ClientRow | null = null;

  try {
    profile = await fetchClient();
  } catch (error) {
    console.error("/api/me fetch client", error);
    return res.status(500).json({ error: "No se pudo obtener el perfil" });
  }

  if (method === "GET") {
    if (!profile) {
      try {
        const ensured = await ensureClientForAuthUser({
          authUserId: session.user.id,
          email: session.user.email ?? null,
          fullName: fallback.fullName,
          phone: fallback.phone,
        });
        if (ensured?.id) {
          profile = await fetchClient();
        }
      } catch (linkError: unknown) {
        if (linkError instanceof ClientLinkConflictError) {
          return res.status(409).json({ error: linkError.message });
        }
        console.error("/api/me ensure client", linkError);
      }
    }

    return res.status(200).json(
      shapeProfile({
        authUserId: session.user.id,
        client: profile,
        fallback,
      })
    );
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const rawName =
    typeof payload?.fullName === "string" ? payload.fullName.trim() : "";
  const rawPhone =
    typeof payload?.phone === "string" ? payload.phone.trim() : "";
  const countryCandidate =
    typeof payload?.phoneCountry === "string"
      ? payload.phoneCountry.toUpperCase()
      : "";
  const phoneCountry: StudioPhoneCountry = countryCandidate === "ES" ? "ES" : "MX";

  if (!rawName) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  if (!rawPhone) {
    return res.status(400).json({ error: "El teléfono es obligatorio" });
  }

  const normalizedPhone = normalizePhoneInput(rawPhone, {
    countryIso: phoneCountry,
    fallbackCountry: phoneCountry,
  });
  if (!normalizedPhone.ok) {
    return res.status(400).json({ error: normalizedPhone.error });
  }

  if (!profile) {
    try {
      const ensured = await ensureClientForAuthUser({
        authUserId: session.user.id,
        email: session.user.email ?? null,
        fullName: rawName,
        phone: normalizedPhone.value,
      });

      if (ensured?.id) {
        profile = await fetchClient();
      }
    } catch (linkError: unknown) {
      if (linkError instanceof ClientLinkConflictError) {
        return res.status(409).json({ error: linkError.message });
      }
      console.error("/api/me ensure client (patch)", linkError);
      return res
        .status(500)
        .json({ error: "No se pudo preparar el perfil del cliente" });
    }
  }

  const clientId = profile?.id ?? null;
  if (!clientId) {
    return res.status(500).json({ error: "No se pudo resolver el cliente" });
  }

  const { error: updateClientError } = await supabaseAdmin
    .from("clients")
    .update({
      full_name: rawName,
      phone: normalizedPhone.value,
      email: session.user.email ?? null,
    })
    .eq("id", clientId);

  if (updateClientError) {
    console.error("/api/me update client", updateClientError);
    return res.status(500).json({ error: "No se pudo actualizar el perfil" });
  }

  const existingMetadata = (session.user.user_metadata ?? {}) as Record<
    string,
    unknown
  >;

  const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
    session.user.id,
    {
      user_metadata: {
        ...existingMetadata,
        full_name: rawName,
        phone: normalizedPhone.value,
      },
    }
  );

  if (updateUserError) {
    console.error("/api/me update user metadata", updateUserError);
    return res
      .status(500)
      .json({ error: "No se pudo actualizar la informacion del usuario" });
  }

  try {
    profile = await fetchClient();
  } catch (error) {
    console.error("/api/me refetch client", error);
  }

  return res.status(200).json(
    shapeProfile({
      authUserId: session.user.id,
      client: profile,
      fallback: {
        ...fallback,
        fullName: rawName,
        phone: normalizedPhone.value,
      },
    })
  );
}
