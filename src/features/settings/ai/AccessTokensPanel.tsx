/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccessTokensPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI — the personal access tokens of the user.
 *
 * A token is a credential of its own: it is minted from a fresh session, it
 * is shown ONCE, and the server keeps only its hash. The panel says so, and
 * it says what an agent with the token will read: the text other members
 * wrote (C119).
 *
 * The token is never written down here: it lives in the state of this panel
 * until the user closes it, and the snippet below shows the environment
 * variable it belongs in — never the literal (C112).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2 } from "lucide-react";

import {
  createAccessToken,
  isAiConfigured,
  listAccessTokens,
  revokeAccessToken,
  type AiAccessScope,
  type AiAccessToken,
  type AiAccessTokenCreated,
} from "@/features/ai/api/aiClient";
import { AiError } from "@/features/ai/api/aiContract";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

/** A workspace the user may give a token. */
export interface AccessTokenWorkspace {
  id: string;
  name: string;
}

/** The environment variable the snippet reads the token from (C112). */
export const PAT_ENV_VAR = "OSIONOS_PAT";

/**
 * What an agent with the token may read, in the words of the user (C119).
 *
 * osionos hands over what the token's scope allows and nothing else: the
 * agent's other tools are outside our reach, and we say so.
 */
export const AGENT_COPY =
  "An agent using this token reads text that other members wrote. osionos cannot see or control the agent's other tools.";

/**
 * True when the service answered 404 to the list: the feature is off on this
 * deployment (R-C4a) and the panel renders nothing. Any other failure stays a
 * message. Caveat: a 404 from a proxy in front of a service that has the
 * feature on also hides the panel.
 */
export function isAccessTokensOff(failure: unknown): boolean {
  return failure instanceof AiError && failure.status === 404;
}

/** The words of a session that is too old to mint a token (C113). */
export const REAUTH_MESSAGE = "Sign in again to create a token.";

/**
 * The refusals of the service, in plain words.
 *
 * The codes are the ones the service answers with; every one of them has a
 * sentence here, so the panel never shows a code to a person.
 */
export const TOKEN_REFUSALS: Record<string, string> = {
  reauth_required: REAUTH_MESSAGE,
  workspace_forbidden: "You are not a member of one of the workspaces you chose.",
  too_many_tokens: "You already hold twenty live tokens. Revoke one to make room.",
  rate_limited: "Too many tokens minted in a minute. Wait a moment and try again.",
};

/** The days a token may live: the choices the panel offers. */
const EXPIRY_CHOICES = [7, 30, 90, 365];

/** The scopes the panel offers, with the words that say what they reach. */
const SCOPE_CHOICES: { id: AiAccessScope; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "write_approval", label: "Propose changes (you approve each one in osionos)" },
];

const CHIP =
  "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium";

const FIELD_LABEL = "block text-xs font-medium text-[var(--osio-fg-default)]";

const FIELD_INPUT =
  "mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none transition-colors focus-visible:border-[var(--osio-accent)]";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-50";

const DANGER_BUTTON =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50";

/** The sentence of a refusal: the code's own words, or the generic one. */
function tokenFailureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return errorWords("network_error");
  return TOKEN_REFUSALS[code] ?? errorWords(code);
}

/**
 * The snippet the user copies into the configuration of their agent.
 *
 * It reads the token from an environment variable and NEVER from a literal:
 * a config file with the token in it is a file the token escapes from (C112).
 */
export function tokenConfigSnippet(): string {
  return `export ${PAT_ENV_VAR}="<the token you just copied>"`;
}

/**
 * The box of a token that was just minted.
 *
 * The token is here once, and once only: the panel shows it, the user copies
 * it, and the server never gives it back (C112).
 */
export const ShowOnceTokenBox: React.FC<{ token: string }> = ({ token }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(token);
      setCopied(true);
    } catch {
      // The browser refused the clipboard: the token is on the screen anyway.
    }
  };

  return (
    <div
      data-testid="pat-show-once"
      className="rounded-lg border border-[var(--osio-accent)]/40 bg-[var(--osio-bg-surface)] p-3"
    >
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-[var(--osio-accent-text)]" aria-hidden />
        <span className="text-sm font-medium text-[var(--osio-fg-default)]">Your token is ready</span>
      </div>
      <p className="mt-1 text-xs leading-[16px] text-[var(--osio-fg-muted)]">
        You will not see this token again.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code
          data-testid="pat-token-value"
          className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] px-2 py-1.5 font-mono text-xs text-[var(--osio-fg-default)]"
        >
          {token}
        </code>
        <button type="button" onClick={() => void copy()} className={SECONDARY_BUTTON}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{AGENT_COPY}</p>
      <pre
        data-testid="pat-snippet"
        className="mt-2 overflow-x-auto rounded-md bg-[var(--osio-bg-muted)] px-2 py-1.5 font-mono text-xs text-[var(--osio-fg-default)]"
      >
        {tokenConfigSnippet()}
      </pre>
    </div>
  );
};

/**
 * The revoke control of a token.
 *
 * The confirmation is INLINE, in the row of the token: the panel never opens
 * the confirmation dialog of the browser, which the page cannot style and the
 * keyboard cannot reach.
 */
export const RevokeControl: React.FC<{
  name: string;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ name, confirming, busy, onAsk, onCancel, onConfirm }) =>
  confirming ? (
    <span className="flex items-center gap-2" role="group" aria-label={`Revoke ${name}`}>
      <span className="text-xs text-[var(--osio-fg-muted)]">Revoke this token?</span>
      <button type="button" onClick={onConfirm} disabled={busy} className={DANGER_BUTTON}>
        {busy ? "Revoking…" : "Revoke"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
      >
        Cancel
      </button>
    </span>
  ) : (
    <button type="button" onClick={onAsk} className={DANGER_BUTTON}>
      <Trash2 size={12} aria-hidden /> Revoke
    </button>
  );

/** The day a token was last used, in the words of the panel. */
function lastUsedWords(token: AiAccessToken): string {
  if (token.revokedAt) return "Revoked";
  if (token.lastUsedAt) return `Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`;
  return "Never used";
}

/**
 * The panel: the tokens of the user, and the form that mints one.
 */
export const AccessTokensPanel: React.FC<{ workspaces: AccessTokenWorkspace[] }> = ({
  workspaces,
}) => {
  const [tokens, setTokens] = useState<AiAccessToken[]>([]);
  const [created, setCreated] = useState<AiAccessTokenCreated | null>(null);
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  // The form.
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AiAccessScope[]>(["read"]);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(30);

  const refresh = useCallback(async () => {
    try {
      setTokens(await listAccessTokens());
    } catch (failure) {
      if (isAccessTokensOff(failure)) setOff(true);
      else setError(tokenFailureMessage(failure));
    }
  }, []);

  useEffect(() => {
    if (!isAiConfigured()) return;
    void refresh();
  }, [refresh]);

  const names = useMemo(() => {
    const map = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
    return (id: string) => map.get(id) ?? id;
  }, [workspaces]);

  const toggleScope = (scope: AiAccessScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
  };

  const toggleWorkspace = (id: string) => {
    setWorkspaceIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const submit = async () => {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const minted = await createAccessToken({
        name: name.trim(),
        scopes,
        workspaceIds,
        expiresInDays,
      });
      setCreated(minted);
      setName("");
      setScopes(["read"]);
      setWorkspaceIds([]);
      setExpiresInDays(30);
      setNotice("The token is created.");
      await refresh();
    } catch (failure) {
      setError(tokenFailureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const revoke = async (id: string) => {
    setBusy(`revoke:${id}`);
    setError("");
    try {
      await revokeAccessToken(id);
      setConfirming(null);
      setNotice("The token is revoked.");
      await refresh();
    } catch (failure) {
      setError(tokenFailureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  if (!isAiConfigured()) {
    return (
      <section className="space-y-4" data-settings-anchor="ai-access-tokens" data-testid="ai-access-tokens-panel">
        <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-sm text-[var(--osio-fg-muted)]">
          The AI service is not configured in this build, so there are no tokens to mint.
        </div>
      </section>
    );
  }

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && workspaceIds.length > 0;

  if (off) return null;

  return (
    <section className="space-y-5" data-settings-anchor="ai-access-tokens" data-testid="ai-access-tokens-panel">
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Personal access tokens</h4>
        <p className="text-sm leading-[18px] text-[var(--osio-fg-muted)]">
          A token lets an agent of yours reach osionos with your own rights, in the
          workspaces you choose. It is shown once, and the server keeps only a hash of it.
        </p>
      </div>

      {error ? (
        <p role="alert" data-testid="ai-access-tokens-error" className="text-sm text-[var(--osio-danger)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-testid="ai-access-tokens-notice" className="text-sm text-[var(--osio-fg-muted)]">
          {notice}
        </p>
      ) : null}

      {created ? <ShowOnceTokenBox token={created.token} /> : null}

      {/* The form that mints a token. */}
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
        <h5 className="text-sm font-medium text-[var(--osio-fg-default)]">Create a token</h5>
        <div className="mt-3 space-y-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="pat-name">
              Name
            </label>
            <input
              id="pat-name"
              type="text"
              maxLength={64}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My agent"
              className={FIELD_INPUT}
            />
          </div>

          <fieldset>
            <legend className={FIELD_LABEL}>What the token may do</legend>
            <div className="mt-1 space-y-1.5">
              {SCOPE_CHOICES.map((choice) => (
                <label key={choice.id} className="flex items-start gap-2 text-sm text-[var(--osio-fg-default)]">
                  <input
                    type="checkbox"
                    checked={scopes.includes(choice.id)}
                    onChange={() => toggleScope(choice.id)}
                    className="mt-0.5"
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={FIELD_LABEL}>Workspaces</legend>
            {workspaces.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
                You are not a member of a workspace yet.
              </p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {workspaces.map((workspace) => (
                  <label
                    key={workspace.id}
                    className="flex items-start gap-2 text-sm text-[var(--osio-fg-default)]"
                  >
                    <input
                      type="checkbox"
                      checked={workspaceIds.includes(workspace.id)}
                      onChange={() => toggleWorkspace(workspace.id)}
                      className="mt-0.5"
                    />
                    <span>{workspace.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div>
            <label className={FIELD_LABEL} htmlFor="pat-expiry">
              Expires after
            </label>
            <select
              id="pat-expiry"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              className={FIELD_INPUT}
            >
              {EXPIRY_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || busy === "create"}
              className={PRIMARY_BUTTON}
            >
              {busy === "create" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Create token
            </button>
            {!canSubmit ? (
              <span className="text-xs text-[var(--osio-fg-muted)]">
                A name, a scope and at least one workspace are needed.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* The tokens of the user. */}
      <div className="space-y-2">
        <h5 className="text-sm font-medium text-[var(--osio-fg-default)]">Your tokens</h5>
        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">No token of yours yet.</p>
        ) : (
          <div className="divide-y divide-[var(--osio-border-default)] rounded-lg border border-[var(--osio-border-default)]">
            {tokens.map((token) => (
              <div key={token.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--osio-fg-default)]">
                    {token.name}
                  </div>
                  <div className="truncate text-xs text-[var(--osio-fg-muted)]">
                    ···· {token.last4} · {token.scopes.join(", ")} ·{" "}
                    {token.workspaceIds.map(names).join(", ")}
                  </div>
                  <div className="truncate text-xs text-[var(--osio-fg-muted)]">
                    Expires {new Date(token.expiresAt).toLocaleDateString()} ·{" "}
                    {lastUsedWords(token)}
                  </div>
                </div>
                {token.revokedAt ? (
                  <span className={`${CHIP} bg-[var(--osio-bg-muted)] text-[var(--osio-fg-muted)]`}>
                    <ShieldAlert size={11} aria-hidden /> Revoked
                  </span>
                ) : null}
                <RevokeControl
                  name={token.name}
                  confirming={confirming === token.id}
                  busy={busy === `revoke:${token.id}`}
                  onAsk={() => setConfirming(token.id)}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => void revoke(token.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
