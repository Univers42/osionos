/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VariableMenu.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { caretPopoverStyle, type CaretPosition } from "@/shared/lib/dom/caretPosition";
import { usePageStore } from "@/store/usePageStore";

import { FILTER_SUGGESTIONS, rankSuggestions, variableSuggestions } from "../model/variableCatalog";
import { openEnvFile } from "../model/openEnvFile";
import { resolveVariable } from "../model/variableResolver";
import { variablePlacement, variableScopeFor } from "../model/variableScope";
import type { VariableTrigger } from "../model/variableTrigger";
import { useVariablesStore } from "../model/useVariablesStore";

const WIDTH = 320;
const MAX_HEIGHT = 360;
// Only the shown rows are resolved for their preview, so a 500-name env.json costs a
// filter pass per keystroke, not 500 resolutions.
const SHOWN = 50;

interface VariableMenuProps {
  pageId: string;
  position: CaretPosition;
  trigger: VariableTrigger;
  onSelect: (insert: string) => void;
  onClose: () => void;
}

/** The `{{` menu: names with their value and origin, or after `|`, filters with their result. */
export const VariableMenu: React.FC<VariableMenuProps> = ({ pageId, position, trigger, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  // Re-render when env files, titles or properties change under an open menu.
  useVariablesStore((s) => s.version);
  const { mode, name, query } = trigger;

  // Rebuilt per render, which is per keystroke: the placement is memoized, and the
  // bench case "{{ menu: catalog + rank + 50 previews" keeps the rest measured.
  const items = rankSuggestions(mode === "name" ? variableSuggestions(variablePlacement(pageId)) : FILTER_SUGGESTIONS, query, SHOWN);
  const scope = variableScopeFor(pageId);
  const previews = items.map((item) => resolveVariable(mode === "name" ? item.insert : `${name} | ${item.insert}`, scope));

  // The highlight returns to the top whenever the query changes.
  const [active, setActive] = useState({ query, index: 0 });
  const index = active.query === query ? Math.min(active.index, items.length - 1) : 0;
  const move = (to: number) => setActive({ query, index: Math.max(0, Math.min(to, items.length - 1)) });

  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    // Capture phase, stopped: the editor never sees a key the menu used, so Enter
    // does not split the block and the arrows do not move the caret between blocks.
    const onKeyDown = (event: KeyboardEvent) => {
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.key === "Escape") {
        take();
        onClose();
      } else if (items.length === 0) {
        return;
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        take();
        move(index + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter" || event.key === "Tab") {
        take();
        onSelect(items[index].insert);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  });

  const style = useMemo(() => caretPopoverStyle(position, WIDTH, MAX_HEIGHT), [position]);
  if (typeof document === "undefined") return null;
  const workspaceId = usePageStore.getState().pageById(pageId)?.workspaceId;
  const openEnv = (parentPageId?: string) => {
    onClose();
    if (workspaceId) void openEnvFile(workspaceId, parentPageId);
  };

  // Portal to <body> so `position: fixed` resolves against the viewport, not the
  // editor page's `container-type: size` containing block.
  return createPortal(
    <div ref={ref} data-testid="variable-menu" className="osio-surface-overlay fixed z-[var(--osio-z-popover)] flex w-80 flex-col overflow-hidden" style={style}>
      <p className="osio-menu-label">{mode === "name" ? "Variables" : `Filters for ${name}`}</p>
      <div role="listbox" aria-label={mode === "name" ? "Variables" : "Filters"} className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && <p className="px-2 py-1 text-xs text-[var(--osio-fg-muted)]">No match for “{query}”</p>}
        {items.map((item, i) => {
          const preview = previews[i];
          return (
            <button
              key={item.insert}
              type="button"
              role="option"
              aria-selected={i === index}
              className="osio-menu-item"
              style={{ height: "auto", paddingBlock: 4 }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => move(i)}
              onClick={() => onSelect(item.insert)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-mono text-xs">{item.insert}</span>
                  <span className={`ml-auto max-w-[55%] truncate text-xs ${preview?.error ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-muted)]"}`}>
                    {preview ? (preview.error ?? preview.text) : ""}
                  </span>
                </span>
                <span className="truncate text-2xs text-[var(--osio-fg-subtle)]">{item.source}</span>
              </span>
            </button>
          );
        })}
      </div>
      {mode === "name" && workspaceId && (
        <div className="border-t border-[var(--osio-menu-separator)] p-1">
          <button type="button" className="osio-menu-item" data-tone="muted" onMouseDown={(event) => event.preventDefault()} onClick={() => openEnv(pageId)}>
            Variables for this page and its sub-pages…
          </button>
          <button type="button" className="osio-menu-item" data-tone="muted" onMouseDown={(event) => event.preventDefault()} onClick={() => openEnv()}>
            Workspace variables…
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
};
