/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HeaderDesigner.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";

import { Modal } from "@/shared/ui/primitives/Modal";
import { Button } from "@/shared/ui/atoms/Button";
import type { PageEntry } from "@/entities/page";
import type { HeaderTemplate } from "@/entities/page/model/headerTemplate";
import { TemplateHeader } from "@/pages/notion-page/ui/TemplateHeader";

import { useHeaderDesigner } from "../model/useHeaderDesigner";
import { useHeaderTemplateStore } from "../model/headerTemplateStore";
import { SELECT, SlotEditor } from "./SlotEditor";

export interface HeaderScope {
  /** Override-store key this scope writes ("page:<id>", a database id, "global"). */
  key: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where "Save" may write, most specific first — the first is preselected. */
  scopes: ReadonlyArray<HeaderScope>;
  template: HeaderTemplate;
  /** A record used to render the live preview. */
  sample: PageEntry;
  /** Property keys (+ core fields) a slot may bind to. */
  bindKeys: string[];
}

/** Visual, drag-and-drop header customizer: rearrange/rebind slots with a live
 *  preview, pick the scope (this page / database / everywhere), save or reset. */
export const HeaderDesigner: React.FC<Props> = ({ open, onClose, scopes, template, sample, bindKeys }) => {
  const { draft, moveSlot, updateSlot, addSlot, removeSlot } = useHeaderDesigner(template);
  const setOverride = useHeaderTemplateStore((s) => s.setOverride);
  const clearOverride = useHeaderTemplateStore((s) => s.clearOverride);
  const overrides = useHeaderTemplateStore((s) => s.overrides);
  const [scopeKey, setScopeKey] = useState(scopes[0]?.key ?? "global");
  const drag = useRef<{ r: number; i: number } | null>(null);

  const save = () => {
    setOverride(scopeKey, draft);
    onClose();
  };
  const reset = () => {
    clearOverride(scopeKey);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Customize header">
      <div className="flex flex-col gap-4 p-4">
        {scopes.length > 1 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--osio-fg-muted)]">Apply to</span>
            <select aria-label="Apply to" className={SELECT} value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
              {scopes.map((scope) => (
                <option key={scope.key} value={scope.key}>{scope.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">Live preview</p>
          <TemplateHeader template={draft} page={sample} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {draft.regions.map((region, ri) => (
            <div
              key={region.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag.current) moveSlot(drag.current.r, drag.current.i, ri, region.slots.length);
                drag.current = null;
              }}
              className="rounded-lg border border-[var(--osio-border-default)] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">{region.kind}</p>
                <button type="button" className="text-xs font-medium text-[var(--osio-accent-text)] hover:underline" onClick={() => addSlot(ri, "text")}>
                  + slot
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {region.slots.map((slot, si) => (
                  <SlotEditor
                    key={slot.id}
                    slot={slot}
                    bindKeys={bindKeys}
                    onChange={(patch) => updateSlot(ri, si, patch)}
                    onRemove={() => removeSlot(ri, si)}
                    onDragStart={() => {
                      drag.current = { r: ri, i: si };
                    }}
                    onDropOnto={() => {
                      if (drag.current) moveSlot(drag.current.r, drag.current.i, ri, si);
                      drag.current = null;
                    }}
                  />
                ))}
                {region.slots.length === 0 ? <p className="px-1 py-2 text-xs text-[var(--osio-fg-subtle)]">Drop a slot here</p> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--osio-fg-subtle)]">Drag slots to reorder or move between regions. Applies instantly, synced to your workspace.</p>
          <div className="flex gap-2">
            {overrides[scopeKey] ? (
              <Button tone="ghost" onClick={reset}>Reset to default</Button>
            ) : null}
            <Button tone="ghost" onClick={onClose}>Cancel</Button>
            <Button tone="primary" onClick={save}>Save header</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
