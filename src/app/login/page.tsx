"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) return setMsg(error.message);

    // role-based redirect happens on /route
    router.push("/route");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      return setMsg(error.message);
    }

    // Create profile server-side (RLS on profiles is broken for anon key).
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "vendor" }),
    });

    setLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return setMsg(json.error || "Account created but profile setup failed.");
    }

    setMsg("Account created. You can log in now.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>ShipSheet Login</h1>
      <p style={{ opacity: 0.8 }}>Sign in to manage fulfillment updates.</p>

      <form onSubmit={signIn} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />

        <button
          disabled={loading}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #000" }}
        >
          {loading ? "..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={signUp}
          disabled={loading}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        >
          Create account (for you first)
        </button>

        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      </form>
    </div>
  );
}
