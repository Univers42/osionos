/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accessTokenRows.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";

import { AGENT_COPY, tokenConfigSnippet } from "./accessTokenWords";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "./aiPanelClasses";

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
