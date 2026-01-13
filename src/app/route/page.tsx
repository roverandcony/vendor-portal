import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function RoleRoute() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;

  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  let { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const { data: created } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        role: "vendor",
        is_active: true,
      })
      .select("role,is_active")
      .single();

    profile = created ?? null;
  }

  if (!profile?.is_active) redirect("/login");

  if (profile.role === "admin") redirect("/admin");
  redirect("/vendor");
}
