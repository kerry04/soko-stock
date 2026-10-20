import { createClient } from "@supabase/supabase-js";

// Bearer auth for the paper-trading file routes. Mirrors the generated
// requireSupabaseAuth middleware (Bearer → getClaims → sub), adapted to
// plain server handlers. Throws a JSON Response on failure so handlers
// can `catch (e) { if (e instanceof Response) return e; throw e; }`.
export async function paperUserId(request: Request): Promise<string> {
  const denied = (status: number, error: string) =>
    new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { "content-type": "application/json" },
    });

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw denied(401, "login_required");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw denied(500, "server_misconfigured");

  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await sb.auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (error || !sub) throw denied(401, "invalid_token");
    return sub as string;
  } catch (e) {
    if (e instanceof Response) throw e;
    throw denied(502, "auth_unavailable");
  }
}

// Service-role client for ledger writes (bypasses RLS; user scoping is
// enforced by always filtering on the validated user_id).
export function paperAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
