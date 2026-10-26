/**
 * Hub › Agents — the list: the built-ins first (read-only), then the custom
 * agents the caller may see.
 *
 * The list NEVER shows instructions (C300, C332): the service does not send
 * them here and this file does not read the field. They load in the editor.
 */

import React from "react";

import type { AiAgent, AiCustomAgent } from "@/features/ai/api/aiContract";
import { scopeWords } from "@/features/ai/model/agentForm";
import { CHIP, MCP_BOX, NEEDS_REVIEW_CHIP, MCP_STATUS_CHIP, MCP_TEXT_MUTED_SM, MCP_TEXT_MUTED_XS, MCP_TITLE } from "./aiPanelClasses";
import { Button } from "@/shared/ui";

export interface AgentRowActions {
  onTry: (agent: AiCustomAgent) => void;
  onEdit: (agent: AiCustomAgent) => void;
  onAskArchive: (id: string | null) => void;
  onArchive: (agent: AiCustomAgent) => void;
}

export interface AgentRowState {
  busy: string;
  confirming: string | null;
}

const ArchiveControl: React.FC<{ agent: AiCustomAgent; state: AgentRowState; actions: AgentRowActions }> = ({ agent, state, actions }) =>
  state.confirming === agent.id ? (
    <span className="flex items-center gap-2" role="group" aria-label={`Archive ${agent.name}`}>
      <span className={MCP_TEXT_MUTED_XS}>Archive this agent? It cannot be restored.</span>
      <Button size="sm" tone="danger" onClick={() => actions.onArchive(agent)} disabled={state.busy === `archive:${agent.id}`}>
        Archive
      </Button>
      <Button size="sm" onClick={() => actions.onAskArchive(null)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="sm" tone="danger" onClick={() => actions.onAskArchive(agent.id)}>
      Archive
    </Button>
  );

const Row: React.FC<{ agent: AiAgent; state: AgentRowState; actions: AgentRowActions }> = ({ agent, state, actions }) => {
  const custom = agent.kind === "custom" ? agent : null;
  return (
    <div className={MCP_BOX} data-testid={custom ? "agent-custom" : "agent-builtin"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`min-w-0 truncate ${MCP_TITLE}`}>{agent.name}</span>
        {custom ? (
          <>
            <span className={`${CHIP} ${MCP_STATUS_CHIP}`} data-testid="agent-scope">{scopeWords(custom.scope)}</span>
            {custom.needsReview ? <span className={`${CHIP} ${NEEDS_REVIEW_CHIP}`} data-testid="agent-needs-review">Needs review</span> : null}
          </>
        ) : (
          <span className={`${CHIP} ${MCP_STATUS_CHIP}`}>Built-in</span>
        )}
      </div>
      {agent.description ? <div className={`mt-0.5 ${MCP_TEXT_MUTED_XS}`}>{agent.description}</div> : null}
      {custom ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => actions.onTry(custom)} disabled={custom.needsReview}>Try it</Button>
          <Button size="sm" onClick={() => actions.onEdit(custom)}>{state.busy === `open:${custom.id}` ? "Opening…" : "Edit"}</Button>
          <ArchiveControl agent={custom} state={state} actions={actions} />
        </div>
      ) : null}
    </div>
  );
};

/** The agents, built-ins first; an archived agent is not listed. */
export const AgentList: React.FC<{ agents: AiAgent[]; state: AgentRowState; actions: AgentRowActions }> = ({ agents, state, actions }) => {
  const shown = agents.filter((agent) => agent.kind !== "custom" || !agent.archived);
  if (shown.length === 0) return <p className={MCP_TEXT_MUTED_SM}>No agent yet.</p>;
  const ordered = [...shown.filter((agent) => agent.kind !== "custom"), ...shown.filter((agent) => agent.kind === "custom")];
  return (
    <div className="space-y-3">
      {ordered.map((agent) => (
        <Row key={agent.id} agent={agent} state={state} actions={actions} />
      ))}
    </div>
  );
};
