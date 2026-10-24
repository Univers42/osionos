/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileFieldPopover.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { README_FIELDS } from "@/entities/block/model/binding";
import type { Block } from "@/entities/block";
import { openSettings } from "@/features/settings/model/settingsNav";
import { Section, SettingRow } from "@/features/settings/ui/settingsKit";
import { MENU_PANEL_CLASS } from "@/features/page-management/ui/menuChrome";
import { useClickOutside, useEscapeKey } from "@/shared/ui";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";

import { bindBlock, clipPreview, previewFor, restyleBlock, styleOf, unbindBlock, type ProfileFieldStyle } from "../model/bindingEdit";
import { PROFILE_FIELD_SETTINGS_EVENT } from "../model/readmePage";

const FIELD = "osio-field w-full px-2 text-sm";
const ACTION_BUTTON =
  "rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]";
const STYLES: Array<{ value: ProfileFieldStyle; label: string }> = [
  { value: "text", label: "Text" },
  { value: 1, label: "Heading 1" },
  { value: 2, label: "Heading 2" },
  { value: 3, label: "Heading 3" },
];
const PENDING_MS = 1000;

// The slash item and the block menu bind a block and announce it in the same tick, before
// the bound editor (the only listener) has mounted. This module-level listener remembers
// the last announcement so that editor can open on mount. Caveat: it expires after 1 s, so
// an editor that mounts later (a slow idle-queued pane) does not open a popover by surprise.
let pendingBlockId: string | null = null;
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener(PROFILE_FIELD_SETTINGS_EVENT, (event) => {
    const blockId = (event as CustomEvent<{ blockId?: string }>).detail?.blockId;
    pendingBlockId = blockId ?? null;
    setTimeout(() => { if (pendingBlockId === blockId) pendingBlockId = null; }, PENDING_MS);
  });
}

/** Open state for one bound block: true on mount if it was just announced, and on each later event. */
export function useProfileFieldSettingsOpen(blockId: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => pendingBlockId === blockId);
  useEffect(() => {
    if (pendingBlockId === blockId) pendingBlockId = null;
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<{ blockId?: string }>).detail?.blockId !== blockId) return;
      pendingBlockId = null;
      setOpen(true);
    };
    globalThis.addEventListener(PROFILE_FIELD_SETTINGS_EVENT, onOpen);
    return () => globalThis.removeEventListener(PROFILE_FIELD_SETTINGS_EVENT, onOpen);
  }, [blockId]);
  return [open, setOpen];
}

function Preview({ block, onClose }: { block: Block; onClose: () => void }): React.ReactElement {
  const status = useAccountProfileStore((s) => s.status);
  const profile = useAccountProfileStore((s) => s.profile);
  const hydrate = useAccountProfileStore((s) => s.hydrate);
  const muted = "text-sm text-[var(--osio-fg-muted)]";

  if (status === "idle" || status === "loading") return <p className={muted} role="status">Loading your profile…</p>;
  if (status !== "ready" || !profile) {
    return (
      <div role="status">
        <p className={muted}>Could not load your profile, so there is no preview. The binding still works.</p>
        <button type="button" className={`${ACTION_BUTTON} mt-2`} onClick={() => { void hydrate(); }}>Retry</button>
      </div>
    );
  }
  const value = previewFor(profile, block.fieldBind);
  if (value === null) {
    return (
      <div role="status">
        <p className={muted}>Empty on your profile — readers see nothing here.</p>
        <button type="button" className={`${ACTION_BUTTON} mt-2`} onClick={() => { onClose(); openSettings("profile", "public-profile"); }}>
          Edit public profile
        </button>
      </div>
    );
  }
  return <p title={value} className="text-sm text-[var(--osio-fg-default)]">{clipPreview(value)}</p>;
}

interface PopoverProps {
  block: Block;
  anchorRef: React.RefObject<HTMLElement | null>;
  onSave: (updates: Partial<Block>) => void;
  /** `restoreFocus` is true when the user dismissed with the keyboard or finished an action. */
  onClose: (restoreFocus: boolean) => void;
}

/** The inspector of a bound README block: field, style, live preview, unbind. */
export const ProfileFieldPopover: React.FC<PopoverProps> = ({ block, anchorRef, onSave, onClose }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const known = README_FIELDS.some((field) => field.key === block.fieldBind);
  const dismiss = useCallback(() => onClose(true), [onClose]);
  const dismissOutside = useCallback(() => onClose(false), [onClose]);
  useClickOutside([panelRef, anchorRef], dismissOutside);
  useEscapeKey(dismiss);

  const changeField = (key: string) => {
    const patch = bindBlock(block, key, styleOf(block));
    if (patch) onSave(patch);
  };
  const changeStyle = (value: string) => {
    const style: ProfileFieldStyle = value === "text" ? "text" : (Number(value) as 1 | 2 | 3);
    onSave((known ? bindBlock(block, block.fieldBind ?? "", style) : null) ?? restyleBlock(style));
  };

  return (
    <div ref={panelRef} role="dialog" aria-label="Profile field settings"
      className={`${MENU_PANEL_CLASS} absolute left-0 top-full z-20 mt-1 w-[min(24rem,90vw)] p-3`}>
      <Section title="Profile field">
        <SettingRow stack title="Field" action={
          <select aria-label="Profile field" className={FIELD} autoFocus value={known ? block.fieldBind : ""}
            onChange={(event) => changeField(event.target.value)}>
            {!known && <option value="" disabled>Unknown field</option>}
            {README_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </select>
        } />
        <SettingRow stack title="Style" action={
          <select aria-label="Profile field style" className={FIELD} value={String(styleOf(block))}
            onChange={(event) => changeStyle(event.target.value)}>
            {STYLES.map((style) => <option key={style.value} value={String(style.value)}>{style.label}</option>)}
          </select>
        } />
      </Section>
      <Section title="Preview" className="mt-3">
        <Preview block={block} onClose={dismissOutside} />
      </Section>
      <div className="mt-3 flex justify-end">
        <button type="button" className={ACTION_BUTTON} onClick={() => { onSave(unbindBlock()); onClose(true); }}>
          Remove binding
        </button>
      </div>
    </div>
  );
};
