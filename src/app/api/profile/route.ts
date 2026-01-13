import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Profile = {
  id: string;
  email: string | null;
  role: string;
  vendor_name: string | null;
  is_active: boolean;
};

async function requireUser() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return null;
  }
  return auth.user;
}

async function fetchOrCreateProfile(userId: string, email: string | null) {
  const admin = supabaseAdmin();

  const { data } = await admin
    .from("profiles")
    .select("id,email,role,vendor_name,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (data) return data as Profile;

  const insert = {
    id: userId,
    email,
    role: "vendor",
    vendor_name: null,
    is_active: true,
  };

  const { data: created, error } = await admin
    .from("profiles")
    .upsert(insert)
    .select("id,email,role,vendor_name,is_active")
    .single();

  if (error) throw error;
  return created as Profile;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const profile = await fetchOrCreateProfile(user.id, user.email);
    return NextResponse.json(profile);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = body.email ?? user.email;
  const role = body.role ?? "vendor";
  const vendor_name = body.vendor_name ?? null;

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email,
        role,
        vendor_name,
        is_active: true,
      })
      .select("id,email,role,vendor_name,is_active")
      .single();

    if (error) throw error;
    return NextResponse.json(data as Profile);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
