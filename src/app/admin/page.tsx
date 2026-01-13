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

type Vendor = { id: string; email: string | null; vendor_name: string | null };
type PartnerLead = {
  id: string;
  business_name: string;
  email: string;
  business_type: string | null;
  created_at: string;
};
type OrderRow = {
  id: string;
  assigned_vendor_id: string | null;
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

export default function AdminPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerLeads, setPartnerLeads] = useState<PartnerLead[]>([]);
  const gridRef = useRef<AgGridReact<OrderRow>>(null);
  const silentUpdateRef = useRef(0);

  useEffect(() => {
    (async () => {
      const profileRes = await fetch("/api/profile");
      if (profileRes.status === 401) return router.push("/login");
      const profile = await profileRes.json();
      if (!profile.is_active) return router.push("/login");
      if (profile.role !== "admin") return router.push("/vendor");

      const vendorsRes = await fetch("/api/admin/vendors");
      if (vendorsRes.ok) {
        const vendorRows = await vendorsRes.json();
        setVendors(vendorRows || []);
      }

      const ordersRes = await fetch("/api/orders");
      if (ordersRes.ok) {
        const orderRows = await ordersRes.json();
        setRows(orderRows || []);
      }

      const leadsRes = await fetch("/api/admin/partner-leads");
      if (leadsRes.ok) {
        const leads = await leadsRes.json();
        setPartnerLeads(leads || []);
      }

      setLoading(false);
    })();
  }, [router]);

  const vendorMap = useMemo(() => {
    const m = new Map<string, string>();
    vendors.forEach(v => m.set(v.id, v.vendor_name || v.email || v.id));
    return m;
  }, [vendors]);

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

    if (filter === "unassigned") {
      api.setFilterModel({
        assigned_vendor_id: { filterType: "text", type: "blank" },
      });
      return;
    }

    if (filter === "missing_tracking") {
      api.setFilterModel({
        status: { filterType: "text", type: "equals", filter: "shipped" },
        tracking_number: { filterType: "text", type: "blank" },
      });
      return;
    }

    api.setFilterModel({
      status: { filterType: "text", type: "equals", filter },
    });
  }

  function exportCsv() {
    const api = gridRef.current?.api;
    if (!api) return;

    const rowsToExport: OrderRow[] = [];
    api.forEachNodeAfterFilterAndSort(node => {
      if (node.data) rowsToExport.push(node.data as OrderRow);
    });

    const headers = [
      "assigned_vendor",
      "order_number",
      "customer_name",
      "shipping_address",
      "carrier",
      "tracking_number",
      "tracking_url",
      "status",
      "issue_reason",
      "ship_date",
      "updated_at",
    ];

    const escapeValue = (value: string) => {
      if (value.includes('"') || value.includes(",") || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const lines = rowsToExport.map(row => {
      const assignedVendor =
        (row.assigned_vendor_id && vendorMap.get(row.assigned_vendor_id)) || "";
      const values = [
        assignedVendor,
        row.order_number || "",
        row.customer_name || "",
        row.shipping_address || "",
        row.carrier || "",
        row.tracking_number || "",
        row.tracking_url || "",
        row.status || "",
        row.issue_reason || "",
        row.ship_date || "",
        row.updated_at || "",
      ];
      return values.map(value => escapeValue(String(value))).join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders_export_${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const colDefs = useMemo(
    () => [
      {
        field: "assigned_vendor_id",
        headerName: "Assigned Vendor",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: vendors.map(v => v.id) },
        valueFormatter: (p: any) => vendorMap.get(p.value) || "",
      },
      { field: "order_number", headerName: "Vendor Order #", editable: true },
      { field: "customer_name", headerName: "Customer Name", editable: true },
      {
        field: "shipping_address",
        headerName: "Shipping Address",
        editable: true,
        flex: 2,
        cellEditor: "agLargeTextCellEditor",
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { rows: 4, cols: 40 },
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
        cellRenderer: (p: any) => (
          <button
            onClick={() => deleteOrder(p.value)}
            style={{ padding: "4px 8px", border: "1px solid #000", borderRadius: 6 }}
          >
            Delete
          </button>
        ),
      },
    ],
    [vendors, vendorMap]
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

  async function createBlankOrder() {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pre_shipment" }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return alert(json.error || "Failed");
    }

    const data = await res.json();
    setRows(prev => [data as any, ...prev]);
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
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>ShipSheet Admin Orders</h1>
        <button onClick={createBlankOrder} style={{ padding: "8px 10px" }}>
          + New Row
        </button>
        <button onClick={() => router.push("/admin/vendors")} style={{ padding: "8px 10px" }}>
          Vendors
        </button>
        <button onClick={exportCsv} style={{ padding: "8px 10px" }}>
          Export CSV
        </button>
        <button onClick={signOut} style={{ marginLeft: "auto", padding: "8px 10px" }}>
          Logout
        </button>
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
        <button onClick={() => applyFilter("unassigned")} style={{ padding: "6px 10px" }}>
          Unassigned
        </button>
        <button onClick={() => applyFilter("missing_tracking")} style={{ padding: "6px 10px" }}>
          Missing Tracking
        </button>
      </div>
      {partnerLeads.length > 0 && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
            background: "#f9fafb",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Partner Intake Leads</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Business
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Email
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Type
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody>
                {partnerLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {lead.business_name}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {lead.email}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {lead.business_type || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {formatDate(lead.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
