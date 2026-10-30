import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { Button } from "@osionos/ui/atoms/Button";
import { Input } from "@osionos/ui/atoms/Input";
import { useUserStore } from "@/features/auth/model/useUserStore";
import { UNREACHABLE_MESSAGE } from "@/features/auth/model/userStore.helpers";
import { PortalProviders } from "./PortalProviders";
import "./portal-form.css";

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

/** What a field shown with an error carries: the message as its description, and whether it is at fault. */
type ErrorLink = { "aria-describedby"?: string; "aria-invalid"?: true };

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

interface PasswordInputProps { id: string; mode: Mode; value: string; onChange: (v: string) => void; inputRef: Ref<HTMLInputElement>; errorLink: ErrorLink }

function PasswordInput({ id, mode, value, onChange, inputRef, errorLink }: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="osio-portal-password">
      <Input
        ref={inputRef} id={id} type={shown ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"} {...errorLink}
      />
      <button type="button" className="osio-portal-reveal" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

function FormError({ id, message }: { id: string; message: string }) {
  return (
    <p role="alert" id={id} className="osio-portal-error">
      <svg className="osio-portal-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75v3.75M8 11.1v.05" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

/** The sign-in / sign-up form: one column, the provider buttons above the email fields. */
export function PortalForm() {
  const loginWithCredentials = useUserStore((s) => s.loginWithCredentials);
  const error = useUserStore((s) => s.error);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const copy = COPY[mode];
  const shownError = error && error !== "portal-required" ? error : null;
  // Caveat: every refusal the server sends marks both fields invalid, including a 502 from a
  // sign-in service that never checked them; only an unreachable server leaves them unmarked.
  const errorLink: ErrorLink = shownError ? { "aria-describedby": errorId, ...(shownError !== UNREACHABLE_MESSAGE && { "aria-invalid": true }) } : {};

  // The fieldset is disabled while signing in, which drops the focus; a refusal hands it to the password.
  useEffect(() => {
    if (!busy && shownError) passwordRef.current?.focus();
  }, [busy, shownError]);

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
      <PortalProviders disabled={busy} />
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset className="osio-portal-fields" disabled={busy}>
          {mode === "signup" && (
            <Field label="Display name">
              {(id) => <Input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />}
            </Field>
          )}
          <Field label="Email">
            {(id) => (
              <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" {...errorLink} />
            )}
          </Field>
          <Field label="Password" hint={mode === "signup" ? "8 or more characters, with an uppercase and a lowercase letter, a number and a symbol." : undefined}>
            {(id) => <PasswordInput id={id} mode={mode} value={password} onChange={setPassword} inputRef={passwordRef} errorLink={errorLink} />}
          </Field>
          <label className="osio-portal-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this device
          </label>
        </fieldset>
        {shownError ? <FormError id={errorId} message={shownError} /> : null}
        <Button type="submit" tone="primary" size="lg" disabled={busy} aria-busy={busy || undefined} className="osio-portal-submit">
          {busy ? <span className="osio-portal-spinner" aria-hidden="true" /> : null}
          {busy ? copy.busy : copy.submit}
        </Button>
      </form>
      <p className="osio-portal-switch">
        {copy.switchAsk}{" "}
        <button type="button" disabled={busy} onClick={() => setMode(mode === "login" ? "signup" : "login")}>{copy.switchTo}</button>
      </p>
    </div>
  );
}
