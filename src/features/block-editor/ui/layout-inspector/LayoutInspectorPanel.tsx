/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutInspectorPanel.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inspector's two levels: the basic controls, then the rest behind "More".

import React, { useEffect, useId, useRef, useState } from "react";

import type { Block } from "@/entities/block";
import { Button } from "@/shared/ui";
import { layoutControlsFor, type LayoutControl, type LayoutKey } from "../../model/layoutInspector";
import { LayoutControlField, type LayoutChoiceHandler } from "./LayoutControlField";

interface PanelProps {
  block: Block;
  onChoose: LayoutChoiceHandler;
  onReset: () => void;
}

const LABELS: Record<LayoutKey, string> = {
  layout: "Arrange",
  cols: "Columns",
  gap: "Gap",
  align: "Align items",
  justify: "Justify",
  wrap: "Wrap columns",
  minCol: "Min column width",
  stackAt: "Stack below",
  padding: "Padding",
  span: "Span",
};

function labelled(controls: LayoutControl[]): Array<{ control: LayoutControl; label: string }> {
  let column = 0;
  return controls.map((control) => {
    if (control.key !== "span") return { control, label: LABELS[control.key] };
    column += 1;
    return { control, label: `Column ${column} span` };
  });
}

/** Keys pressed in the panel stay in it: Delete on a focused control must not remove the
 *  selected block, and arrows must not move the caret. Escape still closes the popover. */
function keepKeysInside(event: React.KeyboardEvent) {
  if (event.key !== "Escape") event.stopPropagation();
}

function Fields({ controls, onChoose }: Readonly<{ controls: LayoutControl[]; onChoose: LayoutChoiceHandler }>) {
  return labelled(controls).map(({ control, label }) => (
    <LayoutControlField key={`${control.targetId}-${control.key}`} control={control} label={label} onChoose={onChoose} />
  ));
}

export function LayoutInspectorPanel({ block, onChoose, onReset }: Readonly<PanelProps>) {
  const titleId = useId();
  const moreId = useId();
  const [showMore, setShowMore] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controls = layoutControlsFor(block);
  const basic = controls.filter((control) => control.level === "basic");
  const more = controls.filter((control) => control.level === "more");

  useEffect(() => {
    const root = rootRef.current;
    (root?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']") ?? root?.querySelector("select"))?.focus();
  }, []);

  return (
    <div ref={rootRef} role="dialog" aria-labelledby={titleId} data-testid="layout-inspector" className="flex max-h-[min(28rem,70vh)] w-72 flex-col gap-3 overflow-y-auto p-1" onKeyDown={keepKeysInside}>
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="text-sm font-semibold text-[var(--osio-fg-default)]" style={{ fontFamily: "var(--osio-font-ui)", letterSpacing: "normal" }}>Layout</h2>
        <Button size="sm" tone="ghost" onClick={onReset}>Reset</Button>
      </div>
      <Fields controls={basic} onChoose={onChoose} />
      {more.length > 0 ? (
        <Button size="sm" tone="ghost" className="self-start" aria-expanded={showMore} aria-controls={moreId} onClick={() => setShowMore((open) => !open)}>
          More options
        </Button>
      ) : null}
      <div id={moreId} hidden={!showMore} className="flex flex-col gap-3">{showMore ? <Fields controls={more} onChoose={onChoose} /> : null}</div>
    </div>
  );
}
