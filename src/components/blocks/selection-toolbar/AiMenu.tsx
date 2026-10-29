/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiMenu.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Sparkles } from "lucide-react";
import { ToolbarRowButton } from "./ToolbarButton";

export type AskAiHandler = (
  selectionText: string,
  command?: string,
  instruction?: string,
) => void;

interface AiSkill {
  label: string;
  command?: string;
  instruction?: string;
}

const REFORMAT_INSTRUCTION =
  "Reformat this text with clear structure. Keep its meaning and language.";

export const AI_SKILLS: readonly AiSkill[] = [
  { label: "Improve writing", command: "improve" },
  { label: "Proofread", command: "fix" },
  { label: "Explain", command: "explain" },
  {
    label: "Reformat",
    command: "ask",
    instruction: REFORMAT_INSTRUCTION,
  },
];

/**
 * The skill rows of the panel. The old dropdown trigger is gone: the panel
 * shows the skills directly, and "Edit with AI" below them is the bare
 * "Ask AI" action (open the inline prompt on this selection).
 */
export const AiSkillsSection: React.FC<{
  selectionText: string;
  onAskAI: AskAiHandler;
}> = ({ selectionText, onAskAI }) => (
  <div className="pt-1">
    <p className="h-6 px-2 text-xs font-medium text-[var(--osio-fg-muted)]">
      Skills
    </p>
    {AI_SKILLS.map((skill) => (
      <button
        key={skill.label}
        type="button"
        role="menuitem"
        title={skill.label}
        data-selection-panel-control
        disabled={!selectionText}
        className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-menu-item-hover-bg)] data-[kb-active=true]:bg-[var(--osio-menu-item-hover-bg)] disabled:pointer-events-none disabled:opacity-40"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          onAskAI(selectionText, skill.command, skill.instruction)
        }
      >
        {skill.label}
      </button>
    ))}
  </div>
);

export const AiEditRow: React.FC<{
  selectionText: string;
  onAskAI: AskAiHandler;
}> = ({ selectionText, onAskAI }) => (
  <ToolbarRowButton
    title="Ask AI"
    role="menuitem"
    disabled={!selectionText}
    onClick={() => onAskAI(selectionText)}
  >
    <Sparkles
      aria-hidden
      className="h-[18px] w-[18px] shrink-0 text-[var(--osio-fg-muted)]"
    />
    <span className="flex-1 truncate">Edit with AI</span>
  </ToolbarRowButton>
);
