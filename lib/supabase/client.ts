import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Uses the anon key, so every query is subject to RLS —
 * authorization is enforced in the database, not here (ADR-3).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
