/**
 * Hub › Agents — the form that writes a custom agent, or shows one read-only.
 *
 * The draft lives here, so a refusal (a version conflict, a 422) never
 * costs the user's text. A viewer has no instructions in the answer: the
 * form shows the agent read-only and says why (C300).
 */

import React, { useState } from "react";

import type { AiCustomAgent } from "@/features/ai/api/aiContract";
import {
  AGENT_DESCRIPTION_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
  AGENT_SKILL_CHOICES,
  AGENT_TOOL_CHOICES,
  EMPTY_AGENT_DRAFT,
  draftOf,
  validateAgentDraft,
  scopeWords,
  type AgentDraft,
} from "@/features/ai/model/agentForm";
import { FIELD_LABEL, MCP_BOX, MCP_TEXT_DANGER_SM, MCP_TEXT_DANGER_XS, MCP_TEXT_MUTED_XS, MCP_TITLE } from "./aiPanelClasses";
import { Button, Dropdown, Input, Textarea } from "@/shared/ui";
import { Checkbox } from "@osionos/ui/primitives/Checkbox";

export interface AgentFormProps {
  /** The agent to edit, loaded with `GET /agents/:id`; absent for a new one. */
  agent?: AiCustomAgent;
  workspaces: { id: string; name: string }[];
  busy: boolean;
  error: string;
  onSubmit: (draft: AgentDraft) => void;
  onCancel: () => void;
}

const Choices: React.FC<{
  legend: string;
  choices: readonly { id: string; label: string; writes?: boolean }[];
  value: string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}> = ({ legend, choices, value, readOnly, onChange }) => (
  <fieldset className="flex flex-col items-start gap-1.5">
    <legend className={FIELD_LABEL}>{legend}</legend>
    {choices.map((choice) => (
      <Checkbox
        key={choice.id}
        checked={value.includes(choice.id)}
        disabled={readOnly}
        onChange={(on) => onChange(on ? [...value, choice.id] : value.filter((id) => id !== choice.id))}
        label={<span>{choice.label}{choice.writes ? <span className={MCP_TEXT_MUTED_XS}> · asks you first</span> : null}</span>}
      />
    ))}
  </fieldset>
);

const Problem: React.FC<{ id: string; text?: string }> = ({ id, text }) =>
  text ? <p id={`${id}-problem`} data-testid={`${id}-problem`} className={`mt-1 ${MCP_TEXT_DANGER_XS}`}>{text}</p> : null;

/** The new agent form, the edit form, or the read-only view of one agent. */
export const AgentForm: React.FC<AgentFormProps> = ({ agent, workspaces, busy, error, onSubmit, onCancel }) => {
  const [draft, setDraft] = useState<AgentDraft>(() => (agent ? draftOf(agent) : { ...EMPTY_AGENT_DRAFT, workspaceId: workspaces[0]?.id ?? "" }));
  const [touched, setTouched] = useState(false);
  const isNew = agent === undefined;
  // A viewer's answer carries no instructions: nothing to edit, nothing to show.
  const readOnly = agent !== undefined && agent.instructions === undefined;
  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setTouched(true);
    setDraft((now) => ({ ...now, [key]: value }));
  };
  const problems = validateAgentDraft(draft, isNew);
  const shown = touched ? problems : {};
  const ready = Object.keys(problems).length === 0 && touched;

  return (
    <form
      data-testid="agent-form"
      className={`space-y-3 ${MCP_BOX}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !readOnly) onSubmit(draft);
      }}
    >
      <h6 className={MCP_TITLE}>{isNew ? "New agent" : readOnly ? agent.name : `Edit ${agent.name}`}</h6>
      {readOnly ? (
        <p role="note" data-testid="agent-readonly" className={MCP_TEXT_MUTED_XS}>
          You can use this agent but not read or change its instructions.
        </p>
      ) : null}
      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={FIELD_LABEL}>Who can use it</span>
            <Dropdown
              label="Who can use it"
              value={draft.scope}
              options={[
                { value: "user", label: scopeWords("user") },
                { value: "workspace", label: scopeWords("workspace"), disabled: workspaces.length === 0 },
              ]}
              onChange={(next) => set("scope", next)}
            />
          </div>
          {draft.scope === "workspace" ? (
            <div>
              <span className={FIELD_LABEL}>Workspace</span>
              <Dropdown
                label="Workspace"
                value={draft.workspaceId}
                options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
                onChange={(next) => set("workspaceId", next)}
              />
              <Problem id="agent-workspace" text={shown.workspaceId} />
            </div>
          ) : null}
        </div>
      ) : (
        <p className={MCP_TEXT_MUTED_XS}>{scopeWords(agent.scope)} · version {agent.version}</p>
      )}
      <div>
        <label htmlFor="agent-name" className={FIELD_LABEL}>Name</label>
        <Input id="agent-name" className="mt-1" value={draft.name} maxLength={AGENT_NAME_MAX + 20} readOnly={readOnly} autoComplete="off" onChange={(event) => set("name", event.target.value)} />
        <Problem id="agent-name" text={shown.name} />
      </div>
      <div>
        <label htmlFor="agent-description" className={FIELD_LABEL}>Description</label>
        <Input id="agent-description" className="mt-1" value={draft.description} readOnly={readOnly} autoComplete="off" onChange={(event) => set("description", event.target.value)} />
        <Problem id="agent-description" text={shown.description} />
      </div>
      {readOnly ? null : (
        <div>
          <label htmlFor="agent-instructions" className={FIELD_LABEL}>Instructions</label>
          <Textarea id="agent-instructions" className="mt-1 min-h-32" value={draft.instructions} onChange={(event) => set("instructions", event.target.value)} />
          <p data-testid="agent-counter" className={`mt-1 ${draft.instructions.length > AGENT_INSTRUCTIONS_MAX ? MCP_TEXT_DANGER_XS : MCP_TEXT_MUTED_XS}`}>
            {draft.instructions.length} / {AGENT_INSTRUCTIONS_MAX}
          </p>
          <Problem id="agent-instructions" text={shown.instructions} />
        </div>
      )}
      <Choices legend="Tools" choices={AGENT_TOOL_CHOICES} value={draft.tools} readOnly={readOnly} onChange={(next) => set("tools", next)} />
      <Choices legend="Skills" choices={AGENT_SKILL_CHOICES} value={draft.skills} readOnly={readOnly} onChange={(next) => set("skills", next)} />
      <Problem id="agent-skills" text={shown.skills} />
      <p className={MCP_TEXT_MUTED_XS}>
        An agent never picks a model or a connection: it uses yours. Description up to {AGENT_DESCRIPTION_MAX} characters.
      </p>
      {error ? <p role="alert" data-testid="agent-form-error" className={MCP_TEXT_DANGER_SM}>{error}</p> : null}
      <div className="flex gap-2">
        {readOnly ? null : (
          <Button type="submit" tone="primary" disabled={!ready || busy} data-testid="agent-submit">
            {busy ? "Saving…" : isNew ? "Create agent" : "Save"}
          </Button>
        )}
        <Button onClick={onCancel}>{readOnly ? "Close" : "Cancel"}</Button>
      </div>
    </form>
  );
};
