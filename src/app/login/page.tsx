"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import { cn } from "@shared/lib/utils";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasSupabase()) {
      setError(
        "Supabase isn't configured for this environment. Set the NEXT_PUBLIC_SUPABASE_* env vars."
      );
      return;
    }

    setSubmitting(true);
    const sb = getSupabase();
    const { error: signInError } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    // Hard navigation so middleware reads the new cookie on the next request.
    window.location.href = next;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link logo />
          <h1 className="text-xl font-semibold text-text-primary mt-4">
            Sign in
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Welcome back to Good Woods.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-lg p-6 space-y-4 shadow-sm"
        >
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />

          {error && (
            <div className="text-sm text-status-blocked bg-status-blocked-soft border border-status-blocked/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-fast",
              "bg-ink-pill text-white hover:bg-accent-active",
              "disabled:bg-text-disabled disabled:cursor-not-allowed"
            )}
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Link({ logo }: { logo?: boolean }) {
  if (!logo) return null;
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-md bg-accent grid place-items-center">
        <span className="text-white text-sm font-semibold tracking-tight">
          GW
        </span>
      </div>
      <span className="text-base font-semibold text-text-primary tracking-tight">
        Good Woods
      </span>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
      />
    </label>
  );
}
