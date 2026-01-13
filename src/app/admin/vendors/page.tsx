"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VendorsAdmin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function createVendor() {
    setMsg(null);

    const profileRes = await fetch("/api/profile");
    if (profileRes.status === 401) return router.push("/login");
    const profile = await profileRes.json();
    if (profile?.role !== "admin") return router.push("/vendor");

    const res = await fetch("/api/admin/create-vendor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, vendor_name: vendorName }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "Failed");

    setMsg("Vendor created. Send them their login.");
    setEmail("");
    setPassword("");
    setVendorName("");
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <button onClick={() => router.push("/admin")} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>ShipSheet Vendor Setup</h1>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          placeholder="Vendor name (optional)"
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Vendor email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button onClick={createVendor} style={{ padding: 10, borderRadius: 8, border: "1px solid #000" }}>
          Create Vendor
        </button>
        {msg && <div>{msg}</div>}
      </div>
    </div>
  );
}
