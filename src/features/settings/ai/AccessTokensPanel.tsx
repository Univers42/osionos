/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccessTokensPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
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
import { ShieldAlert } from "lucide-react";

import {
  createAccessToken,
  isAiConfigured,
  listAccessTokens,
  revokeAccessToken,
  type AiAccessScope,
  type AiAccessToken,
  type AiAccessTokenCreated,
} from "@/features/ai/api/aiClient";
import { CreateTokenForm } from "./accessTokenCreateForm";
import { McpApprovalsSection } from "./McpApprovalsSection";
import { RevokeControl, ShowOnceTokenBox } from "./accessTokenRows";
import { isAccessTokensOff, lastUsedWords, tokenFailureMessage } from "./accessTokenWords";
import { CHIP } from "./aiPanelClasses";

export { RevokeControl, ShowOnceTokenBox } from "./accessTokenRows";
export {
  AGENT_COPY,
  isAccessTokensOff,
  PAT_ENV_VAR,
  REAUTH_MESSAGE,
  TOKEN_REFUSALS,
  tokenConfigSnippet,
} from "./accessTokenWords";

/** A workspace the user may give a token. */
export interface AccessTokenWorkspace {
  id: string;
  name: string;
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

      <CreateTokenForm
        workspaces={workspaces}
        name={name}
        setName={setName}
        scopes={scopes}
        toggleScope={toggleScope}
        workspaceIds={workspaceIds}
        toggleWorkspace={toggleWorkspace}
        expiresInDays={expiresInDays}
        setExpiresInDays={setExpiresInDays}
        canSubmit={canSubmit}
        busy={busy}
        onSubmit={() => void submit()}
      />

      <McpApprovalsSection />

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
