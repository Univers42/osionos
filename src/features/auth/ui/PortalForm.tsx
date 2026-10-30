import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@osionos/ui/atoms/Button";
import { Input } from "@osionos/ui/atoms/Input";
import { describeConnection, type ConnectionState } from "@/features/auth/model/portalConnection";
import { useUserStore } from "@/features/auth/model/useUserStore";
import { API_BASE } from "@/features/auth/model/userStore.helpers";

type Mode = "login" | "signup";

const COPY: Record<Mode, { title: string; lede: string; submit: string; busy: string; switchAsk: string; switchTo: string }> = {
  login: {
    title: "Sign in to your workspace",
    lede: "Your pages, databases and conversations are where you left them.",
    submit: "Sign in",
    busy: "Signing in…",
    switchAsk: "New to osionos?",
    switchTo: "Create an account",
  },
  signup: {
    title: "Create your account",
    lede: "One account for your pages, databases and conversations.",
    submit: "Create account",
    busy: "Creating account…",
    switchAsk: "Already have an account?",
    switchTo: "Sign in",
  },
};

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="osio-portal-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <p className="osio-portal-hint">{hint}</p> : null}
    </div>
  );
}

function PasswordInput({ id, mode, value, onChange }: { id: string; mode: Mode; value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="osio-portal-password">
      <Input
        id={id} type={shown ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      <button type="button" className="osio-portal-reveal" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

const CONNECTION_TEXT: Record<ConnectionState["kind"], (host: string) => string> = {
  secure: (host) => `Encrypted connection to ${host}`,
  plain: (host) => `Unencrypted connection to ${host}. Sign in only on a network you trust.`,
  offline: () => "No server configured: this copy of osionos keeps your work on this device.",
};

function ConnectionLine() {
  const state = describeConnection(API_BASE);
  return (
    <p className="osio-portal-connection" data-kind={state.kind}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="3" y="7" width="10" height="7" rx="1.6" />
        <path d={state.kind === "secure" ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"} />
      </svg>
      {CONNECTION_TEXT[state.kind](state.host)}
    </p>
  );
}

/** The sign-in / sign-up form: one column, the server it talks to named under it. */
export function PortalForm() {
  const loginWithCredentials = useUserStore((s) => s.loginWithCredentials);
  const error = useUserStore((s) => s.error);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];

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

  return (
    <div className="osio-portal-form">
      <h1>{copy.title}</h1>
      <p className="osio-portal-lede">{copy.lede}</p>
      <form onSubmit={submit} aria-busy={busy}>
        {mode === "signup" && (
          <Field label="Display name">
            {(id) => <Input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />}
          </Field>
        )}
        <Field label="Email">
          {(id) => (
            <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
          )}
        </Field>
        <Field label="Password" hint={mode === "signup" ? "8 or more characters, with an uppercase and a lowercase letter, a number and a symbol." : undefined}>
          {(id) => <PasswordInput id={id} mode={mode} value={password} onChange={setPassword} />}
        </Field>
        <label className="osio-portal-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me signed in on this device
        </label>
        {error && error !== "portal-required" ? <p role="alert" className="osio-portal-error">{error}</p> : null}
        <Button type="submit" tone="primary" size="lg" disabled={busy} className="osio-portal-submit">
          {busy ? copy.busy : copy.submit}
        </Button>
      </form>
      <p className="osio-portal-switch">
        {copy.switchAsk}{" "}
        <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{copy.switchTo}</button>
      </p>
      <ConnectionLine />
    </div>
  );
}
