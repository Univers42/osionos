/**
 * What a "/" action does to the composer's own controls. "/model" and "/agent"
 * open their menu, as a click would: only focusing the button left the reader
 * looking at an unchanged composer, and "/agent" still aimed at the native
 * select the agent chip replaced, so it did nothing at all. "/attach" asks the
 * composer, which opens the file dialog. An action whose control is not drawn
 * is not offered: "/agent" without agents, "/effort" with a model that does not
 * reason.
 */

import type { SettingsSectionId } from "@/features/settings/model/sectionTypes";

export type SlashActionTarget =
  | { kind: "open"; selector: string }
  | { kind: "focus"; selector: string }
  | { kind: "attach" };

export const EFFORT_GROUP = '[role="radiogroup"][aria-label="Reasoning effort"]';
export const MODEL_PICKER_BUTTON = '[data-composer-slot="model"] button';
export const AGENT_PICKER_BUTTON = '[data-testid="ai-agent-picker"] button';

/** The control a "/" action reaches, or null for an action that is not about one. */
export function slashActionTarget(name: string): SlashActionTarget | null {
  if (name === "model") return { kind: "open", selector: MODEL_PICKER_BUTTON };
  if (name === "agent") return { kind: "open", selector: AGENT_PICKER_BUTTON };
  if (name === "attach") return { kind: "attach" };
  if (name === "effort") return { kind: "focus", selector: `${EFFORT_GROUP} [role="radio"][aria-checked="true"]` };
  return null;
}

/** The Settings section (and anchor) each settings "/" action opens. */
const SETTINGS_ACTIONS: Readonly<Record<string, { section: SettingsSectionId; anchor: string | undefined }>> = {
  skills: { section: "ai_skills", anchor: "ai-skills" },
  memory: { section: "ai_memory", anchor: "ai-memory" },
  mcp: { section: "ai_connections", anchor: "mcp-servers" },
  routing: { section: "ai", anchor: "ai-routing" },
  hub: { section: "ai", anchor: undefined },
};

/** Where a "/" action lands in Settings, or null for an action that stays in the composer. */
export function slashSettingsTarget(name: string): { section: SettingsSectionId; anchor: string | undefined } | null {
  return Object.hasOwn(SETTINGS_ACTIONS, name) ? SETTINGS_ACTIONS[name] : null;
}

/** Whether the palette offers an action: its control is drawn inside the composer. */
export function isSlashActionAvailable(name: string, root: Pick<ParentNode, "querySelector"> | null): boolean {
  const target = slashActionTarget(name);
  if (!target || target.kind === "attach") return true;
  return root?.querySelector(target.selector) != null;
}
