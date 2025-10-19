import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SupabaseBrowserClient = SupabaseClient<Database>;

let browserClient: SupabaseBrowserClient | undefined;

export function supabaseBrowser(): SupabaseBrowserClient {
  if (!browserClient) {
    browserClient = createPagesBrowserClient<Database>();
  }
  return browserClient;
}
