"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Login failed");
      }

      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0c0c0d] text-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <div className="w-full space-y-6">
          <div className="flex justify-center">
            <div className="rounded-3xl border border-[#eeba2b]/20 bg-neutral-950/80 p-4 shadow-[0_0_0_1px_rgba(238,186,43,0.06),0_18px_50px_rgba(0,0,0,0.28)]">
              <img
                src="/logo-final.png"
                alt="LB Crea Studio"
                className="h-auto w-[88px] sm:w-[110px]"
              />
            </div>
          </div>

          <div className="w-full rounded-3xl border border-[#eeba2b]/20 bg-neutral-950/80 p-8 shadow-[0_0_0_1px_rgba(238,186,43,0.06),0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="mb-8 space-y-2 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f1cc61]">
              Private Access
            </div>
            <p className="text-sm text-neutral-400">
              Sign in to access the internal workspace.
            </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#eeba2b] px-4 py-3 text-sm font-semibold text-neutral-950 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
