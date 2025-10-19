import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SupabaseServerClient = SupabaseClient<Database>;

type ServerContext =
  | GetServerSidePropsContext
  | { req: NextApiRequest; res: NextApiResponse };

export function createSupabaseServerClient(
  context: ServerContext
): SupabaseServerClient {
  return createPagesServerClient<Database>(context);
}
