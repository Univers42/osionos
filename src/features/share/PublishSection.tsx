/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublishSection.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Globe } from "lucide-react";
import { ModerationWarningNotice } from "@/shared/moderation/ModerationWarningNotice";
import type { ModerationWarning } from "@/shared/moderation/moderationWarning";
import { publishPage, unpublishPage } from "./publishApi";

/** "Publish to web" control in the Share dialog: snapshot a page to /p/:token. */
export const PublishSection: React.FC<{ pageId: string }> = ({ pageId }) => {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<ModerationWarning | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const publicUrl = token ? `${globalThis.location.origin}/p/${token}` : "";

  // The publish is never a bare rejection: a warning L0 asked about is shown,
  // and any other failure is one line of text.
  const doPublish = async (acknowledgeWarning = false) => {
    setBusy(true);
    try {
      const result = await publishPage(pageId, { acknowledgeWarning });
      if (!result.ok) {
        setWarning("warning" in result ? result.warning : null);
        setFailed("message" in result ? result.message : null);
        return;
      }
      setWarning(null);
      setFailed(null);
      setToken(result.token);
    } finally {
      setBusy(false);
    }
  };
  const doUnpublish = async () => { setBusy(true); try { await unpublishPage(pageId); setToken(null); } finally { setBusy(false); } };

  return (
    <div className="mt-3 border-t border-[var(--osio-border-default)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--osio-fg-default)]"><Globe size={12} /> Publish to web</p>
          <p className="text-2xs text-[var(--osio-fg-muted)]">Anyone with the link reads a snapshot.</p>
        </div>
        {token ? (
          <button type="button" onClick={() => void doUnpublish()} disabled={busy} className="shrink-0 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50">Unpublish</button>
        ) : (
          <button type="button" onClick={() => void doPublish()} disabled={busy} className="shrink-0 rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50">{busy ? "…" : "Publish"}</button>
        )}
      </div>
      {token && (
        <div className="mt-2 flex items-center gap-2">
          <input readOnly value={publicUrl} className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-2xs text-[var(--osio-fg-default)]" />
          <button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl)} className="shrink-0 rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]">Copy</button>
        </div>
      )}
      {/* The warning is announced, not shouted: the author hears it once. */}
      <div aria-live="polite">
        {warning && (
          <div className="mt-2">
            <ModerationWarningNotice
              warning={warning}
              onEdit={() => setWarning(null)}
              onConfirm={() => void doPublish(true)}
              confirmLabel="Publish anyway"
            />
          </div>
        )}
        {failed && <p className="mt-2 text-xs text-[var(--osio-danger)]">{failed}</p>}
      </div>
    </div>
  );
};
