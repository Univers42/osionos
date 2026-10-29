/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiMemoryPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI memory: what the assistant suggested to remember about the
 * user in a workspace, and what is remembered. Nothing is remembered until
 * the user approves it here or on the chip in the chat (devil C42, D21).
 * Every list is the caller's own; the service enforces that, not this panel.
 */

import React, { useCallback, useEffect, useState } from "react";

import { isAiConfigured } from "@/features/ai/api/aiClient";
import { approveMemory, archiveMemory, editMemory, listMemories, rejectMemory } from "@/features/ai/api/memories";
import { groupMemories, memoryFailureMessage, type AiMemory } from "@/features/ai/model/memories";
import { FIELD_INPUT } from "./aiPanelClasses";
import type { AccessTokenWorkspace } from "./AccessTokensPanel";
import { AiMemoryRow } from "./AiMemoryRow";

const INTRO =
  "The assistant can suggest facts about you to remember in this workspace. Nothing is remembered until you approve it. Approved memories are shown to the assistant as information about you, only in your own conversations here. You can edit or remove them at any time.";

export const AiMemoryPanel: React.FC<{ workspaces: AccessTokenWorkspace[] }> = ({ workspaces }) => {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [memories, setMemories] = useState<AiMemory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (): Promise<boolean> => {
    try {
      setMemories(await listMemories(workspaceId));
      return true;
    } catch (failure) {
      setMemories([]);
      setError(memoryFailureMessage(failure));
      return false;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isAiConfigured()) return;
    setMemories(null);
    setError("");
    let live = true;
    listMemories(workspaceId).then(
      (list) => { if (live) setMemories(list); },
      (failure) => { if (live) { setMemories([]); setError(memoryFailureMessage(failure)); } },
    );
    return () => { live = false; };
  }, [workspaceId]);

  if (!isAiConfigured() || workspaces.length === 0) return null;

  /** One action, then a reload; the refusal is shown in words. Resolves true on success. */
  const act = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      await action();
      return await load();
    } catch (failure) {
      setError(memoryFailureMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const { proposed, approved } = groupMemories(memories ?? []);
  const rows = (list: AiMemory[], empty: string) =>
    list.length === 0 ? (
      <p className="mt-2 text-xs text-[var(--osio-fg-muted)]">{empty}</p>
    ) : (
      <ul className="mt-2 space-y-2">
        {list.map((memory) => (
          <AiMemoryRow
            key={memory.id}
            memory={memory}
            busy={busy}
            onApprove={() => void act(() => approveMemory(memory.id))}
            onReject={() => void act(() => rejectMemory(memory.id))}
            onRemove={() => void act(() => archiveMemory(memory.id))}
            onSave={(body) => act(() => editMemory(memory.id, body))}
          />
        ))}
      </ul>
    );

  return (
    <section aria-labelledby="ai-memory-title" className="mt-6">
      <h3 id="ai-memory-title" className="text-sm font-semibold text-[var(--osio-fg-default)]">AI memory</h3>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" className={FIELD_INPUT} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      )}
      <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">{INTRO}</p>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--osio-danger)]">{error}</p>}
      {memories === null ? (
        <p className="mt-3 text-xs text-[var(--osio-fg-muted)]" aria-live="polite">Loading…</p>
      ) : (
        <>
          <h4 className="mt-4 text-xs font-semibold text-[var(--osio-fg-default)]">Waiting for your approval</h4>
          {rows(proposed, "No suggestions waiting.")}
          <h4 className="mt-4 text-xs font-semibold text-[var(--osio-fg-default)]">Remembered</h4>
          {rows(approved, "Nothing remembered yet.")}
        </>
      )}
    </section>
  );
};
