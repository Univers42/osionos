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


import React from "react";
import { SlidersHorizontal } from "lucide-react";

import { TOOL_OPTIONS } from "../model/agentOptions";
import type { AgentRunSettings, AgentToolKey } from "../model/types";

interface AgentParametersProps {
  settings: AgentRunSettings;
  onPatch: (patch: Partial<AgentRunSettings>) => void;
  onToggleTool: (tool: AgentToolKey) => void;
}

/** The run settings: agent, model, effort, page mirroring and the allowed tools. */
export const AgentParameters: React.FC<AgentParametersProps> = ({ settings, onPatch, onToggleTool }) => (
  <section className="border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-5 py-3" aria-label="Claude agent parameters">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--osio-fg-muted)]"><SlidersHorizontal size={14} aria-hidden="true" /> Parameters</span>
            <select name="claude-agent" aria-label="Claude agent" value={settings.agent} onChange={(event) => onPatch({ agent: event.target.value as AgentRunSettings["agent"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="default">Default agent</option>
              <option value="general-purpose">General purpose</option>
              <option value="Explore">Explore</option>
              <option value="Plan">Plan</option>
            </select>
            <select name="claude-model" aria-label="Claude model" value={settings.model} onChange={(event) => onPatch({ model: event.target.value as AgentRunSettings["model"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="default">Default model</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
            <select name="claude-effort" aria-label="Claude effort" value={settings.effort} onChange={(event) => onPatch({ effort: event.target.value as AgentRunSettings["effort"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="low">Low effort</option>
              <option value="medium">Medium effort</option>
              <option value="high">High effort</option>
              <option value="xhigh">Extra high effort</option>
            </select>
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2">
              <input name="mirror-created-pages" type="checkbox" checked={settings.mirrorCreatedPages} onChange={(event) => onPatch({ mirrorCreatedPages: event.target.checked })} />{" "}
              Mirror pages
            </label>
          </div>
          <div className="mx-auto mt-2 flex max-w-4xl flex-wrap gap-1.5">
            {TOOL_OPTIONS.map((tool) => (
              <button key={tool.value} type="button" aria-pressed={settings.allowedTools.includes(tool.value)} data-agent-tool-toggle={tool.value} onClick={() => onToggleTool(tool.value)} className="h-7 rounded-md border border-[var(--osio-border-default)] px-2 text-xs text-[var(--osio-fg-muted)] transition-colors aria-pressed:border-[var(--osio-accent)] aria-pressed:bg-[var(--osio-accent-subtle)] aria-pressed:text-[var(--osio-accent-text)] hover:bg-[var(--osio-bg-hover)]">
                {tool.label}
              </button>
            ))}
          </div>
  </section>
);
