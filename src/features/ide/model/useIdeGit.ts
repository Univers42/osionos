/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeGit.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useState } from "react";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { useUserStore } from "@/features/auth";

export interface GitFileStatus {
  path: string;
  /** Two-char porcelain code (e.g. " M", "??", "A "). */
  code: string;
}

/** Parse `git status --porcelain` output into changed files. */
export function parseGitStatus(output: string): GitFileStatus[] {
  const files: GitFileStatus[] = [];
  for (const line of output.split("\n")) {
    if (line.length < 4) continue;
    files.push({ code: line.slice(0, 2), path: line.slice(3).trim() });
  }
  return files;
}

/**
 * Source-control operations over the sandbox git (P6). status/commit/push only —
 * the 80% path; branch/stash/diff-view come later. PAT is passed straight to the
 * push request and injected into that ONE server exec, never stored.
 * ponytail: no branch/stash UI yet — add when the workflow needs it.
 */
export function useIdeGit() {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const call = useCallback(
    async (argv: string[], pat?: string): Promise<{ ok: boolean; output: string } | null> => {
      const jwt = getActivePageJwt();
      if (!API_BASE || !jwt) { setConnected(false); return null; }
      const res = await fetch(`${API_BASE}/api/ide/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ workspaceId, argv, pat }),
      });
      if (res.status === 404 || res.status === 409) { setConnected(false); return null; }
      setConnected(true);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; output?: string; message?: string };
      if (!res.ok) { setError(data.message ?? `git failed (${res.status})`); return null; }
      return { ok: Boolean(data.ok), output: String(data.output ?? "") };
    },
    [workspaceId],
  );

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    const result = await call(["git", "status", "--porcelain"]);
    if (result) setFiles(parseGitStatus(result.output));
    setBusy(false);
  }, [call]);

  const commit = useCallback(async (message: string) => {
    setBusy(true); setError(null);
    await call(["git", "add", "-A"]);
    await call(["git", "commit", "-m", message]);
    await refresh();
    setBusy(false);
  }, [call, refresh]);

  const push = useCallback(async (pat: string) => {
    setBusy(true); setError(null);
    const result = await call(["git", "push"], pat || undefined);
    if (result && !result.ok) setError(result.output.split("\n").slice(-2).join(" ").slice(0, 160));
    setBusy(false);
  }, [call]);

  return { files, busy, error, connected, refresh, commit, push };
}
