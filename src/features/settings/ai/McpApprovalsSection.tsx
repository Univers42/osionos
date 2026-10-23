/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpApprovalsSection.tsx                            :+:      :+:    :+:   */
/*                                                    +#+#+#+#+#+   +#+         */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * Settings › AI — the writes an outside agent asked for, and the user decides.
 *
 * An MCP agent never writes: it proposes, and the question waits in this
 * section until the user answers it (C117). The card names the agent, and it
 * says what osionos cannot see: the agent's reads are outside our reach.
 *
 * The list is loaded when the panel opens and again every thirty seconds
 * while it stays open. A decision changes the card in place; the next load
 * drops the row, because the service lists the pending writes only.
 */

import React, { useEffect, useState } from "react";

import { refusalWords } from "@/features/chat/model/approvalCard";
import {
  ApprovalError,
  listMcpApprovals,
  type McpApproval,
} from "@/features/chat/model/approvals";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";

/** How often the list of what waits is asked again. */
export const MCP_APPROVALS_POLL_MS = 30_000;

/** The count line: how many agents wait, in plain words. */
export function waitingWords(count: number): string {
  if (count <= 0) return "No agent is waiting for you.";
  if (count === 1) return "1 write is waiting";
  return `${count} writes are waiting`;
}

/** The refusal of a load: the code's words, or the generic one. */
function loadFailureWords(error: unknown): string {
  return refusalWords(error instanceof ApprovalError ? error.code : "unknown");
}

/** The writes of the outside agents, and the decision of the user. */
export const McpApprovalsSection: React.FC = () => {
  const [approvals, setApprovals] = useState<McpApproval[]>([]);
  const [failure, setFailure] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const found = await listMcpApprovals();
        if (!alive) return;
        setApprovals(found);
        setFailure("");
      } catch (error) {
        if (!alive) return;
        // No retry storm: the next tick of the same thirty-second cadence is
        // the only retry, and the line says what the refusal meant.
        setFailure(loadFailureWords(error));
      } finally {
        if (alive) setLoaded(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), MCP_APPROVALS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section
      className="space-y-2"
      aria-labelledby="ai-mcp-approvals-heading"
      data-testid="ai-mcp-approvals"
    >
      <h4 id="ai-mcp-approvals-heading" className="text-sm font-medium text-[var(--osio-fg-default)]">
        Waiting for your decision
      </h4>
      {failure ? (
        <p role="alert" data-testid="ai-mcp-approvals-error" className="text-sm text-[var(--osio-danger)]">
          {failure}
        </p>
      ) : (
        <p aria-live="polite" className="text-xs text-[var(--osio-fg-muted)]">
          {loaded ? waitingWords(approvals.length) : "Loading the agents' writes…"}
        </p>
      )}
      {approvals.length > 0 ? (
        <ul className="space-y-2">
          {approvals.map((approval) => (
            <li key={approval.approvalId}>
              <ApprovalCard
                approvalId={approval.approvalId}
                approval={approval}
                agentName={approval.agentName}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
