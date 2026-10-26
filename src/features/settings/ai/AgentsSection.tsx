/**
 * Hub › Agents — list, create, edit, archive and try the custom agents of the
 * caller, plus the workspace's two switches.
 *
 * When the settings route answers 404 the feature is off on this deployment:
 * the built-ins show read-only, with no "New agent" button and no switches.
 * The role of the caller is read live by the service, so the editing controls
 * are shown and a 403 is said in words (the same compromise as the skills panel).
 */

import React, { useCallback, useEffect, useState } from "react";

import {
  archiveAgent,
  createAgent,
  getAgent,
  isAiConfigured,
  listAgents,
  updateAgent,
  type AiAgent,
  type AiCustomAgent,
} from "@/features/ai/api/aiClient";
import { agentFailureMessage, createBodyOf, isVersionConflict, patchBodyOf, type AgentDraft } from "@/features/ai/model/agentForm";
import { useAgentRequest } from "@/features/chat/model/agentRequest";
import { chatTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { AgentForm } from "./AgentForm";
import { AgentList, type AgentRowActions } from "./AgentRows";
import { AgentSwitchRowsView, useAgentSettings } from "./AgentSwitchRows";
import { MCP_TEXT_DANGER_SM, MCP_TEXT_MUTED_SM, MCP_TITLE } from "./aiPanelClasses";
import { Button, Dropdown } from "@/shared/ui";

type Editing = { kind: "new" } | { kind: "edit"; agent: AiCustomAgent } | null;

export const AgentsSection: React.FC<{ workspaces: { id: string; name: string }[] }> = ({ workspaces }) => {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { view, change } = useAgentSettings(workspaceId);

  const refresh = useCallback(async () => {
    try {
      setAgents(await listAgents());
      setError("");
    } catch (failure) {
      setError(agentFailureMessage(failure));
    }
  }, []);

  useEffect(() => {
    if (isAiConfigured()) void refresh();
  }, [refresh]);

  const submit = async (draft: AgentDraft) => {
    setFormError("");
    setBusy("form");
    try {
      if (editing?.kind === "edit") await updateAgent(editing.agent.id, patchBodyOf(draft, editing.agent.version));
      else await createAgent(createBodyOf(draft));
      setEditing(null);
      await refresh();
    } catch (failure) {
      setFormError(agentFailureMessage(failure));
      // Someone saved first: take their version number, keep this draft (the form owns it).
      if (isVersionConflict(failure) && editing?.kind === "edit") {
        const fresh = await getAgent(editing.agent.id).catch(() => null);
        if (fresh) setEditing({ kind: "edit", agent: fresh });
      }
    } finally {
      setBusy("");
    }
  };

  const actions: AgentRowActions = {
    onTry: (agent) => {
      useAgentRequest.getState().request(agent.id);
      useWorkspaceLayout.getState().openTab(chatTab());
    },
    onEdit: (agent) => {
      setBusy(`open:${agent.id}`);
      setError("");
      getAgent(agent.id).then(
        (loaded) => {
          setFormError("");
          setEditing({ kind: "edit", agent: loaded });
        },
        (failure: unknown) => setError(agentFailureMessage(failure)),
      ).finally(() => setBusy(""));
    },
    onAskArchive: setConfirming,
    onArchive: (agent) => {
      setBusy(`archive:${agent.id}`);
      archiveAgent(agent.id).then(
        () => {
          setConfirming(null);
          return refresh();
        },
        (failure: unknown) => setError(agentFailureMessage(failure)),
      ).finally(() => setBusy(""));
    },
  };

  const off = view.status === "off";
  const canCreate = !off && workspaces.length > 0;

  return (
    <section className="space-y-3" data-testid="agents-section">
      <div className="space-y-1">
        <h4 className={MCP_TITLE}>Agents</h4>
        <p className={`leading-[18px] ${MCP_TEXT_MUTED_SM}`}>
          An agent is a set of instructions, tools and skills the assistant takes for one run. It uses your model and
          your connection, and every write still waits for your approval.
        </p>
      </div>
      {workspaces.length > 1 ? (
        <Dropdown
          label="Workspace"
          value={workspaceId}
          options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
          onChange={setWorkspaceId}
        />
      ) : null}
      {workspaceId ? <AgentSwitchRowsView view={view} onChange={change} /> : null}
      {error ? <p role="alert" data-testid="agents-error" className={MCP_TEXT_DANGER_SM}>{error}</p> : null}
      <AgentList agents={agents} state={{ busy, confirming }} actions={actions} />
      {editing ? (
        <AgentForm
          key={editing.kind === "edit" ? editing.agent.id : "new"}
          agent={editing.kind === "edit" ? editing.agent : undefined}
          workspaces={workspaces}
          busy={busy === "form"}
          error={formError}
          onSubmit={(draft) => void submit(draft)}
          onCancel={() => setEditing(null)}
        />
      ) : canCreate ? (
        <Button tone="primary" onClick={() => { setFormError(""); setEditing({ kind: "new" }); }}>
          New agent
        </Button>
      ) : null}
    </section>
  );
};
