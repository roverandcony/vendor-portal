import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function supabaseServer() {
  const cookieStore = await cookies();
  const headerList = await headers();

  const getAll = () => {
    if (cookieStore && typeof (cookieStore as any).getAll === "function") {
      return (cookieStore as any).getAll();
    }

    const headerGet = (headerList as any)?.get;
    if (typeof headerGet === "function") {
      const cookieHeader = headerGet.call(headerList, "cookie");
      if (!cookieHeader) return [];

      return cookieHeader
        .split(";")
        .map((c: string) => c.trim())
        .filter(Boolean)
        .map((c: string) => {
          const idx = c.indexOf("=");
          if (idx === -1) return null;
          return { name: c.substring(0, idx), value: c.substring(idx + 1) };
        })
        .filter(Boolean) as { name: string; value: string }[];
    }

    return [];
  };

  const setAll = (cookiesToSet: { name: string; value: string; options: any }[]) => {
    const setter = (cookieStore as any)?.set;
    if (typeof setter !== "function") return;
    cookiesToSet.forEach(({ name, value, options }) => setter.call(cookieStore, name, value, options));
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll,
        setAll,
      },
    }
  );
}
