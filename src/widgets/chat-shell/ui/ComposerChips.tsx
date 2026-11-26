/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ComposerChips.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { FileText, Layers, X } from "lucide-react";

import type { ContextChip } from "@/features/ai/model/aiContext";

interface Props {
  chips: ContextChip[];
  hint?: string | null;
  onRemove: (id: string) => void;
}

/** The pages the answer reads (removable chips) and the picker's hint line. */
export const ComposerChips: React.FC<Props> = ({ chips, hint, onRemove }) => (
  <>
    {chips.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 px-3 pt-2" data-testid="ai-context-chips">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex max-w-56 items-center gap-1 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-2xs text-[var(--osio-fg-default)]"
          >
            {chip.kind === "workspace" ? <Layers size={12} /> : <FileText size={12} />}
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => onRemove(chip.id)}
              className="text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    ) : null}
    {hint ? <p className="px-3 pt-1.5 text-2xs text-[var(--osio-fg-muted)]" data-testid="ai-context-hint">{hint}</p> : null}
  </>
);
