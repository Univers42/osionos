/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeSourceControl.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { GitCommitHorizontal, RefreshCw, Upload } from "lucide-react";

import { useIdeGit } from "../model/useIdeGit";

/** Source Control (P6): status → commit → push over the sandbox git. Shows a
 *  clear "no sandbox" state offline (the routes 404/409 until a workspace
 *  sandbox is running). PAT is entered here and sent only with the push. */
export const IdeSourceControl: React.FC = () => {
  const { files, busy, error, connected, refresh, commit, push } = useIdeGit();
  const [message, setMessage] = React.useState("");
  const [pat, setPat] = React.useState("");

  // Refresh on mount and on workspace change (refresh's identity is keyed to it).
  React.useEffect(() => { void refresh(); }, [refresh]);

  if (connected === false) {
    return (
      <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
        Source control needs a running workspace sandbox. Start it, then reopen this panel.
      </p>
    );
  }

  const onCommit = (): void => {
    const trimmed = message.trim();
    if (!trimmed) return;
    void commit(trimmed);
    setMessage("");
  };

  return (
    <div className="flex h-full flex-col text-[13px] text-[var(--osio-code-fg)]">
      <div className="flex items-center gap-2 p-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          className="flex-1 rounded border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] px-2 py-1 outline-none focus:border-[var(--osio-accent)]"
        />
        <button type="button" title="Refresh" onClick={() => void refresh()} disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)] disabled:opacity-50">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="flex gap-2 px-2 pb-2">
        <button type="button" onClick={onCommit} disabled={busy || !message.trim()}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded bg-[var(--osio-accent)] text-[12px] text-[var(--osio-accent-fg,#fff)] disabled:opacity-50">
          <GitCommitHorizontal size={14} /> Commit
        </button>
        <button type="button" onClick={() => void push(pat)} disabled={busy}
          title="Push (uses the token below)"
          className="inline-flex h-7 items-center justify-center gap-1 rounded border border-[var(--osio-code-border)] px-2 text-[12px] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.12))] disabled:opacity-50">
          <Upload size={14} /> Push
        </button>
      </div>
      <input
        type="password"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        placeholder="Personal access token (for push)"
        className="mx-2 mb-2 rounded border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] px-2 py-1 text-[12px] outline-none focus:border-[var(--osio-accent)]"
      />
      {error && <p className="px-3 pb-1 text-[11px] text-[var(--osio-danger,#ff6b6b)]">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <div className="px-2 py-0.5 text-[11px] uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
          Changes ({files.length})
        </div>
        {files.map((file) => (
          <div key={file.path} className="flex items-center gap-2 rounded px-2 py-0.5 hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.08))]">
            <span className="w-5 shrink-0 text-center font-mono text-[var(--osio-code-fg-muted)]">{file.code.trim() || "•"}</span>
            <span className="truncate">{file.path}</span>
          </div>
        ))}
        {files.length === 0 && !busy && (
          <p className="px-3 py-4 text-center text-[11px] text-[var(--osio-code-fg-muted)]">No changes.</p>
        )}
      </div>
    </div>
  );
};
