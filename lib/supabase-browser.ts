import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function createBrowserSupabaseClient() {
  return createClientComponentClient();
}
