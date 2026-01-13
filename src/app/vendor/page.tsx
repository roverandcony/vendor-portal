"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buildTrackingUrl } from "@/lib/tracking";

import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const CARRIER_OPTIONS = ["DHL", "UPS", "FedEx", "USPS", "Other"];
const STATUS_OPTIONS = ["pre_shipment", "shipped", "issue"];
const ISSUE_REASON_OPTIONS = [
  "Out of stock",
  "Address problem",
  "Supplier delay",
  "Payment mismatch",
  "Other",
];

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  shipping_address: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: "pre_shipment" | "shipped" | "issue";
  issue_reason: string | null;
  ship_date: string | null;
  updated_at: string;
  created_by: string | null;
};

export default function VendorPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<OrderRow>>(null);
  const silentUpdateRef = useRef(0);

  useEffect(() => {
    (async () => {
      const profileRes = await fetch("/api/profile");
      if (profileRes.status === 401) return router.push("/login");
      const profile = await profileRes.json();
      if (!profile.is_active) return router.push("/login");
      setProfileId(profile.id);
      setProfileRole(profile.role);

      const ordersRes = await fetch("/api/orders");
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setRows(data || []);
      }

      setLoading(false);
    })();
  }, [router]);

  function setCellValueSilently(node: any, field: string, value: any) {
    silentUpdateRef.current += 1;
    node.setDataValue(field, value);
  }

  function formatDate(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function applyFilter(filter: string) {
    const api = gridRef.current?.api;
    if (!api) return;

    if (filter === "all") {
      api.setFilterModel(null);
      return;
    }

    api.setFilterModel({
      status: { filterType: "text", type: "equals", filter },
    });
  }

  const colDefs = useMemo(
    () => [
      { field: "order_number", headerName: "Vendor Order #", editable: true },
      { field: "customer_name", headerName: "Customer Name", editable: false },
      {
        field: "shipping_address",
        headerName: "Shipping Address",
        editable: false,
        flex: 2,
        wrapText: true,
        autoHeight: true,
      },
      {
        field: "carrier",
        headerName: "Carrier",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: CARRIER_OPTIONS },
      },
      { field: "tracking_number", headerName: "Tracking #", editable: true },
      {
        field: "tracking_url",
        headerName: "Tracking URL",
        editable: (p: any) => p.data?.carrier === "Other",
        cellEditor: "agTextCellEditor",
        flex: 1.5,
        cellRenderer: (p: any) =>
          p.value ? (
            <a href={p.value} target="_blank" rel="noreferrer">
              Track
            </a>
          ) : (
            ""
          ),
      },
      {
        field: "status",
        headerName: "Status",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: STATUS_OPTIONS },
        cellClassRules: {
          "status-pre": (p: any) => p.value === "pre_shipment",
          "status-shipped": (p: any) => p.value === "shipped",
          "status-issue": (p: any) => p.value === "issue",
        },
      },
      {
        field: "issue_reason",
        headerName: "Issue Reason",
        editable: (p: any) => p.data?.status === "issue",
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ISSUE_REASON_OPTIONS },
      },
      {
        field: "ship_date",
        headerName: "Ship Date",
        editable: false,
        valueFormatter: (p: any) => formatDate(p.value),
      },
      {
        field: "updated_at",
        headerName: "Updated",
        editable: false,
        valueFormatter: (p: any) => formatDate(p.value),
      },
      {
        headerName: "Actions",
        field: "id",
        editable: false,
        filter: false,
        sortable: false,
        cellRenderer: (p: any) => {
          const canDelete = profileId && p.data?.created_by === profileId;
          if (!canDelete) return null;
          return (
            <button
              onClick={() => deleteOrder(p.value)}
              style={{ padding: "4px 8px", border: "1px solid #000", borderRadius: 6 }}
            >
              Delete
            </button>
          );
        },
      },
    ],
    [profileId]
  );

  async function onCellValueChanged(params: any) {
    if (silentUpdateRef.current > 0) {
      silentUpdateRef.current -= 1;
      return;
    }

    const field = params.colDef.field;
    if (!field) return;
    if (params.newValue === params.oldValue) return;

    const row = params.data as OrderRow;
    const prevTrackingUrl = row.tracking_url;
    const autoTrackingUrl = buildTrackingUrl(row.carrier, row.tracking_number);

    if (row.status === "shipped" && (!row.carrier || !row.tracking_number)) {
      alert("Carrier and tracking number are required for shipped orders.");
      setCellValueSilently(params.node, field, params.oldValue);
      return;
    }

    if (row.status === "issue" && !row.issue_reason) {
      if (field === "status") {
        setCellValueSilently(params.node, "issue_reason", "Other");
        row.issue_reason = "Other";
        alert("Issue reason required. Set to Other; update if needed.");
      } else {
        alert("Issue reason is required when status is issue.");
        setCellValueSilently(params.node, field, params.oldValue);
        return;
      }
    }

    const changes: Record<string, any> = { [field]: params.newValue };

    if (field === "carrier" || field === "tracking_number") {
      if (autoTrackingUrl) {
        changes.tracking_url = autoTrackingUrl;
        if (autoTrackingUrl !== prevTrackingUrl) {
          setCellValueSilently(params.node, "tracking_url", autoTrackingUrl);
        }
      }
    }

    if (field === "status" && row.status === "issue" && row.issue_reason === "Other") {
      changes.issue_reason = "Other";
    }

    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        changes,
        audit: {
          field,
          oldValue: params.oldValue,
          newValue: params.newValue,
        },
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert("Save failed: " + (json.error || res.statusText));
      setCellValueSilently(params.node, field, params.oldValue);
      if (autoTrackingUrl && autoTrackingUrl !== prevTrackingUrl) {
        setCellValueSilently(params.node, "tracking_url", prevTrackingUrl);
      }
    }
  }

  async function deleteOrder(orderId: string) {
    const res = await fetch("/api/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return alert(json.error || "Delete failed");
    }

    setRows(prev => prev.filter(r => r.id !== orderId));
  }

  async function signOut() {
    await sb.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>ShipSheet Orders</h1>
        <button onClick={signOut} style={{ marginLeft: "auto", padding: "8px 10px" }}>
          Logout
        </button>
      </div>
      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          marginBottom: 12,
          background: "#f9fafb",
        }}
      >
        <div style={{ fontWeight: 600 }}>
          Got dropshipping partners you want to use ShipSheet with?
        </div>
        <div style={{ opacity: 0.7, marginTop: 4 }}>
          Send their details and we will help get them onboarded quickly.
        </div>
        {profileRole === "admin" ? (
          <button
            onClick={() => router.push("/admin/partner-leads")}
            style={{ marginTop: 10, padding: "6px 10px" }}
          >
            Open Partner Intake Form
          </button>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => applyFilter("all")} style={{ padding: "6px 10px" }}>
          All
        </button>
        <button onClick={() => applyFilter("pre_shipment")} style={{ padding: "6px 10px" }}>
          Pre-Shipment
        </button>
        <button onClick={() => applyFilter("shipped")} style={{ padding: "6px 10px" }}>
          Shipped
        </button>
        <button onClick={() => applyFilter("issue")} style={{ padding: "6px 10px" }}>
          Issues
        </button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="ag-theme-alpine" style={{ width: "100%", height: "70vh" }}>
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={colDefs as any}
            defaultColDef={{ flex: 1, sortable: true, filter: true, resizable: true }}
            theme="legacy"
            rowClassRules={{
              "row-warning": (p: any) =>
                p.data?.status === "shipped" && !p.data?.tracking_number,
            }}
            onCellValueChanged={onCellValueChanged}
            animateRows={true}
            stopEditingWhenCellsLoseFocus={true}
          />
        </div>
      )}
    </div>
  );
}
