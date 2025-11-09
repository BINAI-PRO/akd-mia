import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureClientAppAccess } from "@/lib/supabase-client-auth";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

type SuccessResponse = {
  password: string;
  authUserId: string;
  providers: string[];
  email: string | null;
};

type ErrorResponse = { error: string };

function extractProviders(user: User | null): string[] {
  if (!user) return [];
  if (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.length > 0) {
    return user.app_metadata.providers as string[];
  }
  if (typeof user.app_metadata?.provider === "string") {
    return [user.app_metadata.provider];
  }
  return [];
}

function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!#?";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const access = await requireAdminFeature(req, res, "memberDetail", "EDIT");
  if (!access) return;

  const memberId = typeof req.query.id === "string" ? req.query.id : null;
  if (!memberId) {
    return res.status(400).json({ error: "Identificador de miembro inválido" });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email, phone, auth_user_id")
    .eq("id", memberId)
    .maybeSingle<{
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      auth_user_id: string | null;
    }>();

  if (clientError) {
    console.error("/api/members/[id]/password client lookup", clientError);
    return res.status(500).json({ error: "No se pudo consultar el miembro" });
  }

  if (!client) {
    return res.status(404).json({ error: "Miembro no encontrado" });
  }

  if (!client.email) {
    return res
      .status(400)
      .json({ error: "Este miembro no tiene correo. Guarda un correo antes de generar acceso." });
  }

  let existingAuthUserId = client.auth_user_id ?? null;
  let existingProviders: string[] = [];
  let currentEmail = client.email;

  if (existingAuthUserId) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      existingAuthUserId
    );
    if (authError) {
      if (authError.status === 404) {
        existingAuthUserId = null;
      } else {
        console.error("/api/members/[id]/password auth lookup", authError);
        return res.status(500).json({ error: "No se pudo validar la cuenta existente" });
      }
    } else if (authData?.user) {
      existingProviders = extractProviders(authData.user);
      currentEmail = authData.user.email ?? currentEmail;
      if (existingProviders.includes("google")) {
        return res
          .status(400)
          .json({ error: "Este miembro se autentica con Google y no requiere contraseña manual." });
      }
    }
  }

  const password = generatePassword(12);

  try {
    const authUserId = await ensureClientAppAccess({
      clientId: client.id,
      email: currentEmail,
      password,
      fullName: client.full_name,
      phone: client.phone ?? "",
      existingAuthUserId,
    });

    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    const providers = extractProviders(authData?.user ?? null);
    const responseEmail = authData?.user?.email ?? currentEmail;

    return res.status(200).json({
      password,
      authUserId,
      providers,
      email: responseEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar la contraseña temporal.";
    const status = message.toLowerCase().includes("correo") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
