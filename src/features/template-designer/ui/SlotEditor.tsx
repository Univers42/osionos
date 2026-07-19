/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlotEditor.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { GripVertical, X } from "lucide-react";

import type { HeaderSlot, HeaderSlotKind, HeaderTone } from "@/entities/page/model/headerTemplate";

const KINDS: HeaderSlotKind[] = ["media", "title", "author", "link", "stat", "rating", "text", "badge", "action"];
const TONES: HeaderTone[] = ["default", "primary", "danger", "ghost"];
export const SELECT = "rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-1 text-xs text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--osio-accent)]";

interface Props {
  slot: HeaderSlot;
  bindKeys: string[];
  onChange: (patch: Partial<HeaderSlot>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDropOnto: () => void;
}

/** One draggable slot row: drag handle · kind · bound property · tone · remove. */
export const SlotEditor: React.FC<Props> = ({ slot, bindKeys, onChange, onRemove, onDragStart, onDropOnto }) => (
  <div
    draggable
    onDragStart={onDragStart}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.stopPropagation();
      e.preventDefault();
      onDropOnto();
    }}
    className="flex items-center gap-1.5 rounded-md border border-[var(--osio-border-subtle)] bg-[var(--osio-bg-page)] px-1.5 py-1.5"
  >
    <GripVertical size={14} className="shrink-0 cursor-grab text-[var(--osio-fg-subtle)]" aria-hidden="true" />
    <select aria-label="Slot kind" className={SELECT} value={slot.kind} onChange={(e) => onChange({ kind: e.target.value as HeaderSlotKind })}>
      {KINDS.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
    <select aria-label="Bound field" className={`${SELECT} min-w-0 flex-1`} value={slot.bind ?? ""} onChange={(e) => onChange({ bind: e.target.value || undefined })}>
      <option value="">— field —</option>
      {bindKeys.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
    <select aria-label="Tone" className={SELECT} value={slot.tone ?? "default"} onChange={(e) => onChange({ tone: e.target.value as HeaderTone })}>
      {TONES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
    <button type="button" aria-label="Remove slot" onClick={onRemove} className="shrink-0 rounded p-0.5 text-[var(--osio-fg-subtle)] hover:text-[var(--osio-danger)]">
      <X size={14} />
    </button>
  </div>
);
