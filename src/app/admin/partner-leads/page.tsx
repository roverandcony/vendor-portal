"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PartnerLeadsPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const profileRes = await fetch("/api/profile");
      if (profileRes.status === 401) return router.push("/login");
      const profile = await profileRes.json();
      if (!profile.is_active) return router.push("/login");
      if (profile.role !== "admin") return router.push("/vendor");
      setLoading(false);
    })();
  }, [router]);

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const res = await fetch("/api/admin/partner-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: businessName,
        email,
        business_type: businessType,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return setMsg(json.error || "Failed");
    }

    setBusinessName("");
    setEmail("");
    setBusinessType("");
    setMsg("Lead saved.");
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <button onClick={() => router.push("/admin")} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Partner Intake</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>
        Capture interested businesses so you can onboard them to ShipSheet.
      </p>

      <form onSubmit={submitLead} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          placeholder="Business name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Business email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Business type (e.g., Apparel, Beauty)"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button style={{ padding: 10, borderRadius: 8, border: "1px solid #000" }}>
          Submit
        </button>
        {msg && <div>{msg}</div>}
      </form>
    </div>
  );
}
