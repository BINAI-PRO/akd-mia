#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const [, , email, password, fullName = "", clientId] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/create-supabase-user.mjs <email> <password> [fullName] [clientId]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

console.log(`Creating Supabase user for ${email}...`);

const {
  data: userResponse,
  error: createError,
} = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: fullName
    ? { full_name: fullName }
    : undefined,
  app_metadata: { is_admin: true, role: "admin" },
});

if (createError) {
  console.error("Failed to create user:", createError.message);
  process.exit(1);
}

const createdUser = userResponse.user;

console.log("User created:", {
  id: createdUser?.id,
  email: createdUser?.email,
});

if (clientId && createdUser?.id) {
  console.log(`Linking client ${clientId} with auth user ${createdUser.id}...`);
  const { error: updateError } = await supabase
    .from("clients")
    .update({ auth_user_id: createdUser.id })
    .eq("id", clientId);

  if (updateError) {
    console.error("Client linkage failed:", updateError.message);
    process.exit(1);
  }

  console.log("Client updated successfully.");
}

console.log("Done.");
