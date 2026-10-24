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

import { useCallback, useEffect, useRef, useState } from "react";

import { useUserStore } from "@/features/auth";
import { useUserPreferencesStore } from "@/store/settings";

import { ideFetch } from "../api/ideTransport";

import { parseGitStatus, type GitFileStatus } from "./gitBranch";
import { fetchSshKeys, syncIdeKeys } from "./ideKeys";
import { parseSignedLog, vigilantOf, VIGILANT_LOG_ARGV, type SignedCommit } from "./ideVigilant";

export { parseGitStatus, type GitFileStatus } from "./gitBranch";

export type SandboxGitReply =
  | { kind: "ok"; ok: boolean; output: string }
  /** No session, IDE origin or sandbox permission, or the bridge says the sandbox is off (404/409). */
  | { kind: "unavailable" }
  /** The bridge refused the command; `message` is its reason. */
  | { kind: "failed"; message: string };

/** One `POST /api/ide/git` exec. A network error throws, as it always has. */
export async function runSandboxGit(workspaceId: string, argv: readonly string[], pat?: string): Promise<SandboxGitReply> {
  const result = await ideFetch(workspaceId, "/api/ide/git", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, argv, pat }),
  });
  if (result.kind === "unavailable") return { kind: "unavailable" };
  const res = result.response;
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
  const [commits, setCommits] = useState<SignedCommit[]>([]);
  const [keyCount, setKeyCount] = useState(0);
  const vigilant = useUserPreferencesStore((s) => vigilantOf(s.data));
  const hasPreferences = useUserPreferencesStore((s) => s.data !== null);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const syncedFor = useRef("");

  // The flag lives in the preferences section; a fresh browser has none cached yet.
  useEffect(() => {
    if (!hasPreferences && activeUserId) void useUserPreferencesStore.getState().hydrate(activeUserId);
  }, [hasPreferences, activeUserId]);

  const call = useCallback(
    async (argv: string[], pat?: string): Promise<{ ok: boolean; output: string } | null> => {
      const reply = await runSandboxGit(workspaceId, argv, pat);
      setConnected(reply.kind !== "unavailable");
      if (reply.kind === "failed") setError(reply.message);
      return reply.kind === "ok" ? { ok: reply.ok, output: reply.output } : null;
    },
    [workspaceId],
  );

  // Sync once per workspace, then read the log. A failed key fetch or sync leaves the badge off
  // (no keys known) rather than claiming a check that did not happen.
  const refreshSignatures = useCallback(async () => {
    try {
      if (syncedFor.current !== workspaceId) {
        const keys = await fetchSshKeys();
        if (keys.length === 0 || !(await syncIdeKeys(workspaceId, keys))) return;
        setKeyCount(keys.length);
        syncedFor.current = workspaceId;
      }
      const log = await call([...VIGILANT_LOG_ARGV]);
      if (log?.ok) setCommits(parseSignedLog(log.output));
    } catch {
      setKeyCount(0);
    }
  }, [call, workspaceId]);

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    const result = await call(["git", "status", "--porcelain", "-b"]);
    if (result) setFiles(parseGitStatus(result.output));
    if (result && vigilant) await refreshSignatures();
    setBusy(false);
  }, [call, vigilant, refreshSignatures]);

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

  return { files, busy, error, connected, refresh, commit, push, vigilant, keyCount, commits };
}
