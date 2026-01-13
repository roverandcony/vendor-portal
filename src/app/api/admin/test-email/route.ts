import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendAdminNotification } from "@/lib/email";

export async function POST() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profile?.role !== "admin" || !profile.is_active) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await sendAdminNotification({
    subject: "ShipSheet email test",
    text: `This is a test notification from ShipSheet.\n\nTime: ${new Date().toISOString()}`,
  });

  return NextResponse.json({ ok: true });
}
