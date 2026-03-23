"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Send } from "lucide-react";

type ContactState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const initialState: ContactState = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

export function ContactForm() {
  const [form, setForm] = useState<ContactState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof ContactState>(key: K, value: ContactState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send your message right now.");
      }

      setSuccess("Your message has been sent successfully.");
      setForm(initialState);
    } catch (err: any) {
      setError(err?.message || "Unable to send your message right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Name
            </span>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
              maxLength={120}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Email
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
              maxLength={160}
              required
            />
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Subject
          </span>
          <input
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
            maxLength={160}
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Message
          </span>
          <textarea
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            className="min-h-[180px] w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
            maxLength={4000}
            required
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#eeba2b] px-5 py-3 text-sm font-semibold text-neutral-950 transition-all hover:bg-[#f4c84f] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {loading ? "Sending..." : "Send message"}
        </button>
      </form>
    </div>
  );
}
