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

import React from "react";

import { README_FIELDS, boundFieldText } from "@/entities/block/model/binding";
import type { Block } from "@/entities/block";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";

const PREVIEW_MAX = 120;

/**
 * The editor's view of a bound README block: a chip naming the field and, dimmed beside
 * it, what readers currently see. Reads the owner's profile from the store and never
 * fetches. Caveat: the preview is the owner's own row, so it can lead what a reader
 * sees by their 60 s profile refresh, and a profession shows its id, not the label.
 */
export function BoundFieldEditor({ block, onKeyDown }: { block: Block; onKeyDown?: (event: React.KeyboardEvent) => void }): React.ReactElement {
  const profile = useAccountProfileStore((s) => s.profile);
  const label = README_FIELDS.find((field) => field.key === block.fieldBind)?.label ?? "Unknown field";
  const value = profile ? boundFieldText({ ...profile, id: profile.userId }, block.fieldBind) : null;
  const preview = value && value.length > PREVIEW_MAX ? `${value.slice(0, PREVIEW_MAX)}…` : value;

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Profile field: ${label}`}
      data-bound-field={block.fieldBind}
      onKeyDown={onKeyDown}
      className="flex items-baseline gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
    >
      <span className="shrink-0 rounded-md bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--osio-fg-default)]">
        Profile field: {label}
      </span>
      {preview ? <span title={value ?? undefined} className="min-w-0 truncate text-[var(--osio-fg-muted)]">{preview}</span> : null}
    </div>
  );
}
