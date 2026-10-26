/**
 * The two agent switches of a workspace, drawn from what the SERVER says (C335).
 *
 * They are never drawn from a client store: until the service answered, or when
 * it cannot be reached, a switch is disabled and unchecked, never "on". A 404
 * means custom agents are off on this deployment and nothing is drawn.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AiError, getAgentSettings, putAgentSettings, type AiAgentSettings } from "@/features/ai/api/aiClient";
import { isAgentsOff } from "@/features/ai/model/agentForm";
import { Toggle } from "@/shared/ui";
import { SettingRow } from "../ui/settingsKit";
import { SWITCH_NOTE } from "./aiPanelClasses";

export type AgentSettingsView =
  | { status: "loading" }
  | { status: "off" }
  | { status: "failed" }
  | { status: "ready"; settings: AiAgentSettings; locked: boolean; saveFailed: boolean };

const KEYS = {
  agents: "agents_enabled",
  custom: "custom_agents_allowed",
} as const;

/** The switches of one workspace: read on mount, written whole on a change. */
export function useAgentSettings(workspaceId: string): { view: AgentSettingsView; change: (key: keyof AiAgentSettings, next: boolean) => void } {
  // The answer is tagged with its workspace: another workspace is "loading" until its own answer lands.
  const [answer, setAnswer] = useState<{ workspaceId: string; view: AgentSettingsView } | null>(null);
  const view = useMemo<AgentSettingsView>(() => (answer?.workspaceId === workspaceId ? answer.view : { status: "loading" }), [answer, workspaceId]);
  const setView = useCallback((next: AgentSettingsView) => setAnswer({ workspaceId, view: next }), [workspaceId]);

  useEffect(() => {
    let alive = true;
    getAgentSettings(workspaceId).then(
      (settings) => alive && setView({ status: "ready", settings, locked: false, saveFailed: false }),
      (failure: unknown) => alive && setView({ status: isAgentsOff(failure) ? "off" : "failed" }),
    );
    return () => {
      alive = false;
    };
  }, [workspaceId, setView]);

  const change = useCallback(
    (key: keyof AiAgentSettings, next: boolean) => {
      if (view.status !== "ready") return;
      const settings = { ...view.settings, [key]: next };
      putAgentSettings(workspaceId, settings).then(
        (saved) => setView({ status: "ready", settings: saved, locked: false, saveFailed: false }),
        (failure: unknown) =>
          setView({ ...view, locked: failure instanceof AiError && failure.status === 403, saveFailed: !(failure instanceof AiError && failure.status === 403) }),
      );
    },
    [view, workspaceId, setView],
  );
  return { view, change };
}

function noteOf(view: AgentSettingsView): string {
  if (view.status === "failed") return "Could not load";
  if (view.status === "ready" && view.locked) return "Only an admin can change this";
  if (view.status === "ready" && view.saveFailed) return "Could not save";
  return "";
}

/** The two rows. Pure: the view goes in, markup comes out. */
export const AgentSwitchRowsView: React.FC<{ view: AgentSettingsView; onChange: (key: keyof AiAgentSettings, next: boolean) => void }> = ({ view, onChange }) => {
  if (view.status === "off") return null;
  const ready = view.status === "ready";
  const disabled = !ready || view.locked;
  const note = noteOf(view);
  const action = (key: keyof typeof KEYS, label: string) => (
    <Toggle
      checked={ready && view.settings[KEYS[key]]}
      disabled={disabled}
      onChange={(next) => onChange(KEYS[key], next)}
      label={label}
    />
  );
  const status = note ? <span role="status" data-testid="agent-switches-note" className={SWITCH_NOTE}>{note}</span> : null;
  return (
    <>
      <SettingRow title="Agents" description="Let this workspace run agents" action={<>{status}{action("agents", "Agents")}</>} />
      <SettingRow title="Custom agents" description="Allow members to run their own custom agents in this workspace" action={action("custom", "Custom agents")} />
    </>
  );
};

/** The two switches of a workspace, wired to the server. */
export const AgentSwitchRows: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { view, change } = useAgentSettings(workspaceId);
  return <AgentSwitchRowsView view={view} onChange={change} />;
};
