import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTrackingUrl } from "@/lib/tracking";

type Profile = {
  id: string;
  role: "admin" | "vendor";
  is_active: boolean;
};

async function requireProfile() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  let profile = data as Profile | null;

  if (!profile) {
    const { data: created, error: createErr } = await admin
      .from("profiles")
      .upsert({
        id: auth.user.id,
        email: auth.user.email,
        role: "vendor",
        is_active: true,
      })
      .select("id,role,is_active")
      .single();

    if (createErr) return { error: NextResponse.json({ error: createErr.message }, { status: 500 }) };
    profile = created as Profile;
  }

  return {
    userId: auth.user.id,
    profile,
    admin,
  };
}

export async function GET() {
  const result = await requireProfile();
  if ("error" in result) return result.error;

  const { profile, admin } = result;
  if (!profile.is_active) {
    return NextResponse.json({ error: "inactive" }, { status: 403 });
  }

  const query = admin
    .from("orders")
    .select(
      "id,assigned_vendor_id,order_number,customer_name,shipping_address,carrier,tracking_number,tracking_url,status,issue_reason,ship_date,updated_at,created_by"
    )
    .order("updated_at", { ascending: false });

  if (profile.role === "vendor") {
    query.eq("assigned_vendor_id", profile.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const result = await requireProfile();
  if ("error" in result) return result.error;
  const { profile, admin, userId } = result;

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const insert = {
    status: body.status || "pre_shipment",
    created_by: userId,
    assigned_vendor_id: body.assigned_vendor_id ?? null,
    order_number: body.order_number ?? null,
    customer_name: body.customer_name ?? null,
    shipping_address: body.shipping_address ?? null,
    carrier: body.carrier ?? null,
    tracking_number: body.tracking_number ?? null,
    tracking_url:
      buildTrackingUrl(body.carrier, body.tracking_number) ??
      (body.carrier === "Other" ? body.tracking_url ?? null : null),
    issue_reason: body.issue_reason ?? null,
    ship_date: body.ship_date ?? null,
  };

  const { data, error } = await admin.from("orders").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const result = await requireProfile();
  if ("error" in result) return result.error;
  const { profile, admin, userId } = result;
  const body = await req.json().catch(() => ({}));
  const { id, changes, audit } = body;

  if (!id || !changes || typeof changes !== "object") {
    return NextResponse.json({ error: "id and changes required" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await admin
    .from("orders")
    .select("id,assigned_vendor_id,status,carrier,tracking_number,issue_reason")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "order not found" }, { status: 404 });

  if (profile.role === "vendor" && existing.assigned_vendor_id !== profile.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sanitizedChanges = { ...changes };
  if (profile.role === "vendor") {
    const allowed = new Set([
      "order_number",
      "carrier",
      "tracking_number",
      "tracking_url",
      "status",
      "issue_reason",
    ]);
    Object.keys(sanitizedChanges).forEach((key) => {
      if (!allowed.has(key)) delete (sanitizedChanges as any)[key];
    });
  }

  const nextStatus = (sanitizedChanges as any).status ?? existing.status;
  const nextCarrier = (sanitizedChanges as any).carrier ?? existing.carrier;
  const nextTracking = (sanitizedChanges as any).tracking_number ?? existing.tracking_number;
  const nextIssueReason = (sanitizedChanges as any).issue_reason ?? existing.issue_reason;

  if (nextStatus === "shipped" && (!nextCarrier || !nextTracking)) {
    return NextResponse.json(
      { error: "carrier and tracking number required for shipped" },
      { status: 400 }
    );
  }

  if (nextStatus === "issue" && !nextIssueReason) {
    return NextResponse.json(
      { error: "issue reason required for issue status" },
      { status: 400 }
    );
  }

  const autoTrackingUrl = buildTrackingUrl(nextCarrier, nextTracking);
  if (autoTrackingUrl) {
    (sanitizedChanges as any).tracking_url = autoTrackingUrl;
  } else if (nextCarrier !== "Other") {
    delete (sanitizedChanges as any).tracking_url;
  }

  const { error: updateErr } = await admin.from("orders").update(sanitizedChanges).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const auditField = audit?.field;
  if (auditField && audit?.oldValue !== audit?.newValue) {
    await admin.from("order_updates").insert({
      order_id: id,
      updated_by: userId,
      field: auditField,
      old_value: audit?.oldValue ?? "",
      new_value: audit?.newValue ?? "",
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const result = await requireProfile();
  if ("error" in result) return result.error;
  const { profile, admin, userId } = result;

  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await admin
    .from("orders")
    .select("id,created_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "order not found" }, { status: 404 });

  if (profile.role === "vendor" && existing.created_by !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: delErr } = await admin.from("orders").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
