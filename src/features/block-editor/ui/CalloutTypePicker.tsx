/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalloutTypePicker.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Check, Smile } from "lucide-react";
import { EmojiPicker } from "@/shared/ui";
import { CALLOUT_TYPES, calloutAccent, resolveCalloutType } from "@/entities/block";

interface Props {
  current?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * Set a callout's type: pick a semantic preset (icon + accessible color + label) or a custom
 * emoji. A preset stores its emoji in `block.color` so it resolves back to the same type — this
 * is what makes the callout self-explanatory instead of "pick any emoji and hope for a color".
 */
export const CalloutTypePicker: React.FC<Props> = ({ current, onSelect, onClose }) => {
  const [customOpen, setCustomOpen] = useState(false);

  if (customOpen) {
    return (
      <EmojiPicker
        current={current || "💡"}
        onSelect={(icon) => { onSelect(icon); onClose(); }}
        onRemove={() => { onSelect("📝"); onClose(); }}
        onClose={onClose}
      />
    );
  }

  const active = resolveCalloutType(current);
  return (
    <div
      role="menu"
      aria-label="Callout type"
      className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-panel)] p-1 shadow-lg"
    >
      {CALLOUT_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          role="menuitemradio"
          aria-checked={type.id === active.id}
          onClick={() => { onSelect(type.icon); onClose(); }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)]"
        >
          <span className="text-base" style={{ color: calloutAccent(type) }} aria-hidden="true">{type.icon}</span>
          <span className="flex-1 text-[var(--osio-fg-default)]">{type.label}</span>
          {type.id === active.id ? <Check size={14} className="text-[var(--osio-accent)]" /> : null}
        </button>
      ))}
      <div className="my-1 h-px bg-[var(--osio-border-default)]" />
      <button
        type="button"
        role="menuitem"
        onClick={() => setCustomOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
      >
        <Smile size={16} />
        <span>Custom emoji…</span>
      </button>
    </div>
  );
};
