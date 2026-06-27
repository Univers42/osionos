import { useState, type FormEvent } from "react";
import { useUserStore } from "@/features/auth/model/useUserStore";

type Mode = "login" | "signup";

const OsionosMark = () => (
  <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" style={{ borderRadius: 10 }}>
    <rect width="32" height="32" rx="7" fill="#0B63CE" />
    <circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" strokeWidth="3.2" />
  </svg>
);

/** Full-screen auth portal — the first thing shown when no one is signed in. */
export function Portal() {
  const loginWithCredentials = useUserStore((s) => s.loginWithCredentials);
  const error = useUserStore((s) => s.error);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    try {
      await loginWithCredentials(email, password, remember, mode, name);
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
        mode === value
          ? "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-osio-sm"
          : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--osio-bg-page)] px-6 text-[var(--osio-fg-default)]">
      <section className="w-full max-w-sm rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-panel)] p-7 shadow-[var(--osio-shadow-modal)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <OsionosMark />
          <div>
            <h1 className="text-xl font-semibold">Welcome to osionos</h1>
            <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">
              {mode === "login" ? "Sign in to your workspace" : "Create your account"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-1 rounded-lg bg-[var(--osio-bg-subtle)] p-1">
          {tab("login", "Log in")}
          {tab("signup", "Sign up")}
        </div>

        <form className="mt-5 flex flex-col gap-3" onSubmit={submit}>
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--osio-fg-muted)]">Display name</span>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                autoComplete="nickname" placeholder="Your name"
                className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus:border-[var(--osio-accent)]"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--osio-fg-muted)]">Email</span>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="you@example.com"
              className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus:border-[var(--osio-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--osio-fg-muted)]">Password</span>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="••••••••"
              className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus:border-[var(--osio-accent)]"
            />
            {mode === "signup" && (
              <span className="text-xs text-[var(--osio-fg-muted)]">
                8+ characters with uppercase, lowercase, a number, and a symbol.
              </span>
            )}
          </label>

          <label className="mt-1 flex items-center gap-2 text-sm text-[var(--osio-fg-muted)]">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this device
          </label>

          {error && error !== "portal-required" && (
            <p role="alert" className="rounded-md bg-[color-mix(in_srgb,var(--osio-danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--osio-danger)]">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={busy}
            className="mt-1 inline-flex items-center justify-center rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-semibold text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[var(--osio-fg-muted)]">
          Local account · Track Binocle
        </p>
      </section>
    </div>
  );
}
