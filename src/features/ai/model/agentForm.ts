/**
 * What the custom agent form checks before anything is sent, the bodies it
 * builds, and the sentences of the service's refusals (D3 B2).
 *
 * Caveat: the limits and the two choice lists are copied from the service
 * (agents/validate.ts, agents/builtins.ts, skills/builtins.ts). If they move
 * there and not here, the service still refuses and the form shows the
 * sentence of the code; a tool or skill the service adds stays out of the form
 * until it is added here.
 */

import { AiError } from "@/features/ai/api/aiContract";
import type { AiCustomAgent, CreateAgentInput, UpdateAgentInput } from "@/features/ai/api/aiContract";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

export const AGENT_NAME_MAX = 48;
export const AGENT_DESCRIPTION_MAX = 200;
export const AGENT_INSTRUCTIONS_MAX = 1500;
export const AGENT_SKILLS_MAX = 16;

/** The tools an agent may hold: the read and write tools of agents/builtins.ts. Writes still wait for an approval. */
export const AGENT_TOOL_CHOICES: readonly { id: string; label: string; writes: boolean }[] = [
  { id: "search_workspace", label: "Search the workspace", writes: false },
  { id: "read_page", label: "Read a page", writes: false },
  { id: "graph_neighbors", label: "Follow links between pages", writes: false },
  { id: "create_page", label: "Create a page", writes: true },
  { id: "rename_page", label: "Rename a page", writes: true },
  { id: "archive_page", label: "Archive a page", writes: true },
  { id: "add_blocks", label: "Add blocks to a page", writes: true },
];

/** The skills an agent may list: the built-in skills of skills/builtins.ts. */
export const AGENT_SKILL_CHOICES: readonly { id: string; label: string }[] = [
  { id: "schema-design", label: "Schema design" },
  { id: "acid-review", label: "ACID review" },
  { id: "concise-docs", label: "Concise docs" },
  { id: "data-summary", label: "Data summary" },
];

export interface AgentDraft {
  scope: "user" | "workspace";
  workspaceId: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  skills: string[];
}

export const EMPTY_AGENT_DRAFT: AgentDraft = {
  scope: "user",
  workspaceId: "",
  name: "",
  description: "",
  instructions: "",
  tools: [],
  skills: [],
};

/** The draft an existing agent starts the edit form from. */
export function draftOf(agent: AiCustomAgent): AgentDraft {
  return {
    scope: agent.scope,
    workspaceId: agent.workspaceId ?? "",
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions ?? "",
    tools: [...agent.tools],
    skills: [...agent.skills],
  };
}

export type AgentProblems = Partial<Record<"name" | "description" | "instructions" | "workspaceId" | "skills", string>>;

/** The first problem of each field; a missing key means the field is fine. */
export function validateAgentDraft(draft: AgentDraft, isNew: boolean): AgentProblems {
  const out: AgentProblems = {};
  if (draft.name.trim().length === 0 || draft.name.length > AGENT_NAME_MAX) out.name = `The name is 1 to ${AGENT_NAME_MAX} characters.`;
  if (draft.description.length > AGENT_DESCRIPTION_MAX) out.description = `The description is at most ${AGENT_DESCRIPTION_MAX} characters.`;
  if (draft.instructions.trim().length === 0 || draft.instructions.length > AGENT_INSTRUCTIONS_MAX) {
    out.instructions = `The instructions are 1 to ${AGENT_INSTRUCTIONS_MAX} characters.`;
  }
  if (isNew && draft.scope === "workspace" && !draft.workspaceId) out.workspaceId = "Choose the workspace.";
  if (draft.skills.length > AGENT_SKILLS_MAX) out.skills = `An agent lists at most ${AGENT_SKILLS_MAX} skills.`;
  return out;
}

/** The body of a create: the strict set of keys, and `workspaceId` for workspace scope only. */
export function createBodyOf(draft: AgentDraft): CreateAgentInput {
  return {
    scope: draft.scope,
    ...(draft.scope === "workspace" ? { workspaceId: draft.workspaceId } : {}),
    name: draft.name.trim(),
    description: draft.description,
    instructions: draft.instructions,
    tools: draft.tools,
    skills: draft.skills,
  };
}

/** The body of a patch: the version the draft started from, and the fields as written. */
export function patchBodyOf(draft: AgentDraft, expectedVersion: number): UpdateAgentInput {
  return {
    expectedVersion,
    name: draft.name.trim(),
    description: draft.description,
    instructions: draft.instructions,
    tools: draft.tools,
    skills: draft.skills,
  };
}

/** The sentence of each code the agent routes answer. */
export const AGENT_REFUSALS: Record<string, string> = {
  invalid_request: "The service rejected one of the fields. Check the lengths.",
  unknown_tool: "One of the tools is not offered by the service.",
  invalid_skills: "One of the skills is unknown, repeated or too many.",
  prefix_too_large: "The instructions and the skills are too long together. Shorten the instructions or drop a skill.",
  forbidden: "Only a workspace admin can write a workspace agent.",
  agent_limit: "You reached the number of agents allowed. Archive one first.",
  version_conflict: "Somebody saved this agent first. Your text is kept below: review it and save again.",
  agent_archived: "This agent is archived and can no longer change.",
  not_found: "This agent is not available to you.",
  rate_limited: "Too many changes in a minute. Wait a moment and try again.",
};

/** What a failed agent call says. */
export function agentFailureMessage(error: unknown): string {
  if (error instanceof AiError) return AGENT_REFUSALS[error.code] ?? errorWords(error.code);
  return errorWords(undefined);
}

/** True when the failure is the flag being off on this deployment (404 on the settings or the list route). */
export function isAgentsOff(error: unknown): boolean {
  return error instanceof AiError && error.status === 404;
}

export const isVersionConflict = (error: unknown): boolean =>
  error instanceof AiError && error.code === "version_conflict";

/** The badge of a custom agent's scope. */
export const scopeWords = (scope: "user" | "workspace"): string => (scope === "user" ? "Only you" : "Workspace");
