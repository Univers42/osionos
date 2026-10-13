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

import { parseGitStatus, type GitFileStatus } from "./gitBranch";

export { parseGitStatus, type GitFileStatus } from "./gitBranch";

export type SandboxGitReply =
  | { kind: "ok"; ok: boolean; output: string }
  /** No session or API, or the bridge says the sandbox is off (404/409). */
  | { kind: "unavailable" }
  /** The bridge refused the command; `message` is its reason. */
  | { kind: "failed"; message: string };

/** One `POST /api/ide/git` exec. A network error throws, as it always has. */
export async function runSandboxGit(workspaceId: string, argv: readonly string[], pat?: string): Promise<SandboxGitReply> {
  const jwt = getActivePageJwt();
  if (!API_BASE || !jwt) return { kind: "unavailable" };
  const res = await fetch(`${API_BASE}/api/ide/git`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ workspaceId, argv, pat }),
  });
  if (res.status === 404 || res.status === 409) return { kind: "unavailable" };
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; output?: string; message?: string };
  if (!res.ok) return { kind: "failed", message: data.message ?? `git failed (${res.status})` };
  return { kind: "ok", ok: Boolean(data.ok), output: String(data.output ?? "") };
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
      const reply = await runSandboxGit(workspaceId, argv, pat);
      setConnected(reply.kind !== "unavailable");
      if (reply.kind === "failed") setError(reply.message);
      return reply.kind === "ok" ? { ok: reply.ok, output: reply.output } : null;
    },
    [workspaceId],
  );

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    const result = await call(["git", "status", "--porcelain", "-b"]);
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
