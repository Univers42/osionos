/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentParameters.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React, { useId, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";

import { TOOL_OPTIONS } from "../model/agentOptions";
import type { AgentRunSettings, AgentToolKey } from "../model/types";
import { PILL_CLASS } from "./agentClasses";

interface AgentParametersProps {
  settings: AgentRunSettings;
  onPatch: (patch: Partial<AgentRunSettings>) => void;
  onToggleTool: (tool: AgentToolKey) => void;
}

interface PillSelectProps {
  name: string;
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}

/** A native select drawn as a pill: the browser keeps the keyboard and screen-reader behaviour. */
const PillSelect: React.FC<PillSelectProps> = ({ name, label, value, options, onChange }) => (
  <span className="relative inline-flex">
    <select
      name={name}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${PILL_CLASS} cursor-pointer appearance-none pr-7`}
    >
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
    <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--osio-fg-muted)]" />
  </span>
);

const AGENTS = [["default", "Default agent"], ["general-purpose", "General purpose"], ["Explore", "Explore"], ["Plan", "Plan"]] as const;
const MODELS = [["default", "Default model"], ["sonnet", "Sonnet"], ["opus", "Opus"], ["haiku", "Haiku"]] as const;
const EFFORTS = [["low", "Low effort"], ["medium", "Medium effort"], ["high", "High effort"], ["xhigh", "Extra high effort"]] as const;

/** One tool toggle: a pill that shows a check while the tool is allowed. */
const ToolChip: React.FC<{ label: string; value: AgentToolKey; pressed: boolean; onToggle: (tool: AgentToolKey) => void }> = ({ label, value, pressed, onToggle }) => (
  <button
    type="button"
    aria-pressed={pressed}
    data-agent-tool-toggle={value}
    onClick={() => onToggle(value)}
    className={`${PILL_CLASS} h-7 aria-pressed:bg-[var(--osio-accent-subtle)] aria-pressed:text-[var(--osio-accent-text)]`}
  >
    {pressed ? <Check size={12} aria-hidden="true" /> : null}
    {label}
  </button>
);

/** The run settings: agent, model, effort, page mirroring, and the allowed tools behind a disclosure. */
export const AgentParameters: React.FC<AgentParametersProps> = ({ settings, onPatch, onToggleTool }) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsPanelId = useId();

  return (
    <section className="px-5 py-2" aria-label="Claude agent parameters">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-[var(--osio-fg-muted)]"><SlidersHorizontal size={14} aria-hidden="true" /> Parameters</span>
        <PillSelect name="claude-agent" label="Claude agent" value={settings.agent} options={AGENTS} onChange={(value) => onPatch({ agent: value as AgentRunSettings["agent"] })} />
        <PillSelect name="claude-model" label="Claude model" value={settings.model} options={MODELS} onChange={(value) => onPatch({ model: value as AgentRunSettings["model"] })} />
        <PillSelect name="claude-effort" label="Claude effort" value={settings.effort} options={EFFORTS} onChange={(value) => onPatch({ effort: value as AgentRunSettings["effort"] })} />
        <label className={`${PILL_CLASS} cursor-pointer focus-within:ring-2 focus-within:ring-[var(--osio-focus-ring-color)]`}>
          <input name="mirror-created-pages" type="checkbox" className="accent-[var(--osio-accent)]" checked={settings.mirrorCreatedPages} onChange={(event) => onPatch({ mirrorCreatedPages: event.target.checked })} />
          Mirror pages
        </label>
        <button type="button" aria-expanded={toolsOpen} aria-controls={toolsPanelId} onClick={() => setToolsOpen((open) => !open)} className={PILL_CLASS}>
          Tools · {settings.allowedTools.length} of {TOOL_OPTIONS.length}
          <ChevronDown size={12} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${toolsOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={toolsPanelId} hidden={!toolsOpen} className="mx-auto max-w-3xl">
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOOL_OPTIONS.map((tool) => (
            <ToolChip key={tool.value} label={tool.label} value={tool.value} pressed={settings.allowedTools.includes(tool.value)} onToggle={onToggleTool} />
          ))}
        </div>
      </div>
    </section>
  );
};
