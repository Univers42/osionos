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
import { publishPage, unpublishPage } from "./publishApi";

/** "Publish to web" control in the Share dialog: snapshot a page to /p/:token. */
export const PublishSection: React.FC<{ pageId: string }> = ({ pageId }) => {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const publicUrl = token ? `${globalThis.location.origin}/p/${token}` : "";

  const doPublish = async () => { setBusy(true); try { setToken(await publishPage(pageId)); } finally { setBusy(false); } };
  const doUnpublish = async () => { setBusy(true); try { await unpublishPage(pageId); setToken(null); } finally { setBusy(false); } };

  return (
    <div className="mt-3 border-t border-[var(--osio-border-default)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--osio-fg-default)]"><Globe size={13} /> Publish to web</p>
          <p className="text-[11px] text-[var(--osio-fg-muted)]">Anyone with the link reads a snapshot.</p>
        </div>
        {token ? (
          <button type="button" onClick={() => void doUnpublish()} disabled={busy} className="shrink-0 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50">Unpublish</button>
        ) : (
          <button type="button" onClick={() => void doPublish()} disabled={busy} className="shrink-0 rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50">{busy ? "…" : "Publish"}</button>
        )}
      </div>
      {token && (
        <div className="mt-2 flex items-center gap-2">
          <input readOnly value={publicUrl} className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-[11px] text-[var(--osio-fg-default)]" />
          <button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl)} className="shrink-0 rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]">Copy</button>
        </div>
      )}
    </div>
  );
};
