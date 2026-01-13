import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client that bypasses RLS using the service role key.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing Supabase service role credentials");
  }

  return createClient(url, serviceRole);
}
