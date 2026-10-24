/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BoundFieldEditor.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from "react";

import { README_FIELDS } from "@/entities/block/model/binding";
import type { Block } from "@/entities/block";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";

import { clipPreview, previewFor } from "../model/bindingEdit";
import { ProfileFieldPopover, useProfileFieldSettingsOpen } from "./ProfileFieldPopover";

interface BoundFieldEditorProps {
  block: Block;
  onUpdateBlock: (updates: Partial<Block>) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}

/**
 * The editor's view of a bound README block: a chip naming the field and, dimmed beside
 * it, what readers currently see; the chip opens the inspector. Reads the owner's profile
 * from the store and never fetches. Caveat: the preview is the owner's own row, so it can
 * lead what a reader sees by their 60 s profile refresh.
 */
export function BoundFieldEditor({ block, onUpdateBlock, onKeyDown }: BoundFieldEditorProps): React.ReactElement {
  const profile = useAccountProfileStore((s) => s.profile);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useProfileFieldSettingsOpen(block.id);
  const label = README_FIELDS.find((field) => field.key === block.fieldBind)?.label ?? "Unknown field";
  const value = previewFor(profile, block.fieldBind);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) groupRef.current?.focus();
  };

  return (
    <div className="relative">
      <div
        ref={groupRef}
        role="group"
        tabIndex={-1}
        aria-label={`Profile field: ${label}`}
        data-bound-field={block.fieldBind}
        onKeyDown={onKeyDown}
        className="flex items-baseline gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
          className="shrink-0 rounded-md bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--osio-fg-default)]"
        >
          Profile field: {label}
        </button>
        {value ? <span title={value} className="min-w-0 truncate text-[var(--osio-fg-muted)]">{clipPreview(value)}</span> : null}
      </div>
      {open && <ProfileFieldPopover block={block} anchorRef={groupRef} onSave={onUpdateBlock} onClose={close} />}
    </div>
  );
}
