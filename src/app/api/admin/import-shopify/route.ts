import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_SINCE_DAYS = 30;
const MAX_PAGES = 10;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07";

type ShopifyAddress = {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
};

type ShopifyOrder = {
  id: number;
  name: string;
  order_number: number;
  shipping_address?: ShopifyAddress | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  created_at: string;
};

function getShopDomain() {
  const raw = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "";
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function formatAddress(address?: ShopifyAddress | null) {
  if (!address) return null;
  const header = [address.name, address.company].filter(Boolean).join(" - ");
  const body = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
  if (header && body) return `${header} | ${body}`;
  return header || body || null;
}

function getNextLink(linkHeader: string | null) {
  if (!linkHeader) return null;
  const links = linkHeader.split(",");
  for (const link of links) {
    const [urlPart, relPart] = link.split(";").map((part) => part.trim());
    if (relPart === 'rel="next"' && urlPart.startsWith("<") && urlPart.endsWith(">")) {
      return urlPart.slice(1, -1);
    }
  }
  return null;
}

async function fetchShopifyOrders(token: string, sinceDays: number) {
  const domain = getShopDomain();
  if (!domain) throw new Error("Missing Shopify store domain");

  const createdAtMin = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    status: "open",
    financial_status: "paid",
    fulfillment_status: "unfulfilled",
    created_at_min: createdAtMin,
    limit: "250",
  });
  let url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?${params.toString()}`;
  const orders: ShopifyOrder[] = [];

  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Shopify API error ${res.status}: ${body}`);
    }

    const json = await res.json();
    orders.push(...(json.orders || []));
    url = getNextLink(res.headers.get("link"));
  }

  return orders;
}

export async function POST(req: Request) {
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

  const token = process.env.SHOPIFY_ADMIN_TOKEN || "";
  if (!token) {
    return NextResponse.json({ error: "Missing Shopify admin token" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const sinceDays =
    typeof body.since_days === "number" && body.since_days > 0
      ? body.since_days
      : DEFAULT_SINCE_DAYS;

  try {
    const orders = await fetchShopifyOrders(token, sinceDays);
    const orderNumbers = orders
      .map((order) => order.name || String(order.order_number))
      .filter(Boolean);

    let existingSet = new Set<string>();
    if (orderNumbers.length > 0) {
      const { data: existing } = await admin
        .from("orders")
        .select("order_number")
        .in("order_number", orderNumbers);
      existingSet = new Set((existing || []).map((row) => row.order_number).filter(Boolean));
    }

    const toInsert = orders
      .filter((order) => {
        const orderNumber = order.name || String(order.order_number);
        return orderNumber && !existingSet.has(orderNumber);
      })
      .map((order) => {
        const orderNumber = order.name || String(order.order_number);
        const shippingAddress = formatAddress(order.shipping_address);
        const customerName =
          order.shipping_address?.name ||
          [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
          null;

        return {
          status: "pre_shipment",
          created_by: auth.user?.id ?? null,
          assigned_vendor_id: null,
          order_number: orderNumber,
          customer_name: customerName,
          shipping_address: shippingAddress,
          carrier: null,
          tracking_number: null,
          tracking_url: null,
          issue_reason: null,
          ship_date: null,
        };
      });

    if (toInsert.length > 0) {
      const { error } = await admin.from("orders").insert(toInsert);
      if (error) throw error;
    }

    return NextResponse.json({
      imported: toInsert.length,
      skipped: orders.length - toInsert.length,
      total: orders.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
