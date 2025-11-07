import type { User } from "@supabase/supabase-js";
import { AuthApiError } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

type EnsureClientAppAccessOptions = {
  clientId: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  existingAuthUserId?: string | null;
};

export async function ensureClientAppAccess(options: EnsureClientAppAccessOptions): Promise<string> {
  const { clientId, email, password, fullName, phone, existingAuthUserId } = options;
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("El correo es obligatorio para crear el acceso a la app.");
  }

  if (!password || password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  let authUserId = existingAuthUserId ?? null;

  const metadata = {
    full_name: fullName,
    phone,
  };

  if (authUserId) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      email: normalizedEmail,
      password,
      user_metadata: metadata,
    });
    if (updateError) {
      throw new Error(updateError.message ?? "No se pudo actualizar el usuario de la app.");
    }
  } else {
    const existingUser = await findAuthUserByEmail(normalizedEmail);

    if (existingUser) {
      authUserId = existingUser.id;
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password,
        user_metadata: metadata,
      });
      if (updateError) {
        throw new Error(updateError.message ?? "No se pudo actualizar el usuario existente.");
      }
    } else {
      try {
        const createResponse = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: metadata,
        });
        if (createResponse.error || !createResponse.data?.user) {
          throw new Error(createResponse.error?.message ?? "No se pudo crear el usuario de la app.");
        }
        authUserId = createResponse.data.user.id;
      } catch (createError) {
        if (createError instanceof AuthApiError && createError.status === 422) {
          const fallbackUser = await findAuthUserByEmail(normalizedEmail);
          if (fallbackUser) {
            authUserId = fallbackUser.id;
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
              password,
              user_metadata: metadata,
            });
            if (updateError) {
              throw new Error(updateError.message ?? "No se pudo actualizar el usuario existente.");
            }
          } else {
            throw new Error("El correo ya está registrado en Supabase Auth.");
          }
        } else {
          const message =
            createError instanceof Error ? createError.message : "No se pudo crear el usuario de la app.";
          throw new Error(message);
        }
      }
    }
  }

  if (!authUserId) {
    throw new Error("No se pudo resolver el usuario de la app.");
  }

  const { data: conflicting } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", authUserId)
    .neq("id", clientId)
    .maybeSingle();

  if (conflicting && conflicting.id !== clientId) {
    throw new Error("El correo de acceso ya está asignado a otro miembro.");
  }

  const { error: linkError } = await supabaseAdmin
    .from("clients")
    .update({ auth_user_id: authUserId })
    .eq("id", clientId);

  if (linkError) {
    throw new Error("No se pudo enlazar el usuario de la app con este miembro.");
  }

  return authUserId;
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const targetEmail = email.toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const response = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (response.error) {
      throw new Error(response.error.message ?? "No se pudieron consultar los usuarios actuales.");
    }

    const users = response.data?.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === targetEmail);
    if (match) return match;

    const nextPage = response.data?.nextPage;
    if (!nextPage || nextPage <= page || users.length === 0) {
      break;
    }
    page = nextPage;
  }

  return null;
}
