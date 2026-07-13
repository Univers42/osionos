/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawContextMenu.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The canvas right-click menu. On a connector it leads with the extremity picker
 * (what turns a line into a relation: "◇── composition", "──▸ dependency"); on
 * any element it offers the edit verbs with their shortcut hints; on empty
 * canvas, paste/select-all/fit. Clamped inside the (overflow-hidden) surface by
 * measuring itself — no magic footprint constants.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { Arrowhead, DrawEngine } from "@osionos/draw-engine";
import type { DrawMenuState } from "../model/useDrawContextMenu";

interface DrawContextMenuProps {
  state: DrawMenuState;
  onPickArrowhead: (patch: { start?: Arrowhead; end?: Arrowhead }) => void;
  onRun: (action: (engine: DrawEngine, at: { x: number; y: number }) => void) => void;
  onClose: () => void;
}

const GLYPH: Record<Arrowhead, string> = { none: "—", arrow: "▸", triangle: "▶", dot: "●", diamond: "◆", bar: "|" };
const LABEL: Record<Arrowhead, string> = { none: "None", arrow: "Arrow", triangle: "Triangle", dot: "Dot", diamond: "Diamond", bar: "Bar" };
const KINDS: Arrowhead[] = ["none", "arrow", "triangle", "dot", "diamond", "bar"];

function ExtremityRow({ title, active, onSelect }: { title: string; active: Arrowhead; onSelect: (kind: Arrowhead) => void }) {
  return (
    <div className="px-2 py-1.5">
      <div className="px-1 pb-1 text-[11px] font-medium text-[var(--osio-fg-muted)]">{title}</div>
      <div className="flex gap-1">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={`${title}: ${LABEL[kind]}`}
            aria-pressed={active === kind}
            title={LABEL[kind]}
            onClick={() => onSelect(kind)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors ${
              active === kind
                ? "border-[var(--osio-accent)] bg-[var(--osio-accent)]/10 text-[var(--osio-accent)]"
                : "border-[var(--osio-border-default)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
            }`}
          >
            {GLYPH[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Item({ label, hint, danger, onPick }: { label: string; hint?: string; danger?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className={`flex h-8 w-full items-center justify-between gap-6 px-3 text-left text-[13px] transition-colors hover:bg-[var(--osio-bg-hover)] ${
        danger ? "text-[var(--osio-danger,#e03131)]" : "text-[var(--osio-fg-default)]"
      }`}
    >
      <span>{label}</span>
      {hint ? <span className="text-[11px] text-[var(--osio-fg-muted)]">{hint}</span> : null}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-[var(--osio-border-soft)]" aria-hidden />;
}

export function DrawContextMenu({ state, onPickArrowhead, onRun, onClose }: DrawContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  // Clamp inside the host surface once the real footprint is measurable.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const host = menu?.offsetParent as HTMLElement | null;
    if (!menu || !host) return;
    setPos({
      left: Math.max(4, Math.min(state.x, host.clientWidth - menu.offsetWidth - 4)),
      top: Math.max(4, Math.min(state.y, host.clientHeight - menu.offsetHeight - 4)),
    });
  }, [state.x, state.y]);

  const element = state.element;
  return (
    <>
      {/* Click-away closes; the canvas keeps its own right-click handling. */}
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-[var(--osio-z-popover)] cursor-default"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Canvas menu"
        className="absolute z-[var(--osio-z-popover)] w-56 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-xl"
        style={pos}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        {element?.linear ? (
          <>
            <ExtremityRow title="Start" active={element.linear.start} onSelect={(kind) => onPickArrowhead({ start: kind })} />
            <ExtremityRow title="End" active={element.linear.end} onSelect={(kind) => onPickArrowhead({ end: kind })} />
            <Divider />
          </>
        ) : null}

        {element ? (
          <>
            <Item label="Duplicate" hint="⌘D" onPick={() => onRun((engine) => engine.duplicateSelection())} />
            <Item label="Copy" hint="⌘C" onPick={() => onRun((engine) => engine.copySelection())} />
            <Divider />
            <Item label="Bring to front" hint="⌘⌥]" onPick={() => onRun((engine) => engine.reorderSelection("front"))} />
            <Item label="Bring forward" hint="⌘]" onPick={() => onRun((engine) => engine.reorderSelection("forward"))} />
            <Item label="Send backward" hint="⌘[" onPick={() => onRun((engine) => engine.reorderSelection("backward"))} />
            <Item label="Send to back" hint="⌘⌥[" onPick={() => onRun((engine) => engine.reorderSelection("back"))} />
            <Divider />
            <Item label="Flip horizontal" hint="⇧H" onPick={() => onRun((engine) => engine.flipSelection("horizontal"))} />
            <Item label="Flip vertical" hint="⇧V" onPick={() => onRun((engine) => engine.flipSelection("vertical"))} />
            {element.multi && !element.grouped ? (
              <Item label="Group" hint="⌘G" onPick={() => onRun((engine) => engine.groupSelection())} />
            ) : null}
            {element.grouped ? (
              <Item label="Ungroup" hint="⌘⇧G" onPick={() => onRun((engine) => engine.ungroupSelection())} />
            ) : null}
            <Item
              label={element.locked ? "Unlock" : "Lock"}
              onPick={() => onRun((engine) => engine.toggleLockSelection())}
            />
            <Divider />
            <Item label="Delete" hint="⌫" danger onPick={() => onRun((engine) => engine.deleteSelection())} />
          </>
        ) : (
          <>
            <Item label="Paste" hint="⌘V" onPick={() => onRun((engine, at) => engine.pasteJson(null, at))} />
            <Item label="Select all" hint="⌘A" onPick={() => onRun((engine) => engine.selectAll())} />
            <Item label="Zoom to fit" hint="⇧1" onPick={() => onRun((engine) => engine.fit())} />
          </>
        )}
      </div>
    </>
  );
}
