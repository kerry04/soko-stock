import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Compact inline email+password gate. No new routes: the ticket and the
 * portfolio page render this when signed out. */
export function PaperLoginForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: "signin" | "signup") => {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (res.error) setError(res.error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/40", compact ? "p-3" : "p-4")}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Log in to paper-trade
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Virtual cash only — no real money moves.</p>
      <div className="mt-3 space-y-2">
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || !email || !password}
          onClick={() => run("signin")}
          className="flex-1 rounded-md bg-success/15 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-success disabled:opacity-40"
        >
          Log in
        </button>
        <button
          type="button"
          disabled={busy || !email || !password}
          onClick={() => run("signup")}
          className="flex-1 rounded-md border border-border/70 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Create account
        </button>
      </div>
    </div>
  );
}
