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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

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

const AI_SKILLS: readonly AiSkill[] = [
  { label: "Improve writing", command: "improve" },
  { label: "Proofread", command: "fix" },
  { label: "Explain", command: "explain" },
  {
    label: "Reformat",
    command: "ask",
    instruction: REFORMAT_INSTRUCTION,
  },
];

/** The "Ask AI" trigger and its skill menu. */
export const AiMenu: React.FC<{
  selectionText: string;
  onAskAI: AskAiHandler;
}> = ({ selectionText, onAskAI }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [close, open]);

  const run = useCallback(
    (skill: AiSkill) => {
      onAskAI(selectionText, skill.command, skill.instruction);
      close();
    },
    [close, onAskAI, selectionText],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Ask AI"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!selectionText}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] disabled:pointer-events-none disabled:opacity-40"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Ask AI
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Ask AI"
          className="absolute left-0 top-full z-[var(--osio-z-max)] mt-1.5 w-52 osio-surface-overlay p-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          {AI_SKILLS.map((skill) => (
            <button
              key={skill.label}
              type="button"
              role="menuitem"
              className="osio-menu-item h-7"
              onClick={() => run(skill)}
            >
              {skill.label}
            </button>
          ))}
          <div className="osio-menu-separator" />
          <button
            type="button"
            role="menuitem"
            className="osio-menu-item h-7"
            onClick={() => {
              onAskAI(selectionText);
              close();
            }}
          >
            Edit with AI
          </button>
        </div>
      ) : null}
    </div>
  );
};
