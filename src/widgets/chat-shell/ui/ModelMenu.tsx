/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModelMenu.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/**
 * The model pill and its menu, in the shape of Notion's: "Auto", a few
 * recommended models, "Other models ›" grouped by provider, "Older models ›"
 * with a star to pin one, and the reader's own connections.
 *
 * What it shows comes from `buildModelMenu` (the rules live there). Keyboard:
 * the arrows move inside a panel, → opens a submenu (or reaches the star of a
 * row), ← and Escape close the innermost one, and focus goes back to the pill.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plug } from "lucide-react";

import { Button, Popover } from "@/shared/ui";
import type { AiModel } from "@/features/ai/api/aiClient";
import { PLATFORM_CONNECTION_ID, type AiSelection } from "@/features/ai/model/aiSelection";
import { buildModelMenu, pillLabel, readStarred, toggleStarred, writeStarred, type ModelRow } from "@/features/ai/model/modelMenu";
import { AutoItem, Divider, MenuPanel, ModelRowItem, SectionLabel, SubmenuTrigger } from "./ModelMenuParts";

interface Props {
  value: AiSelection;
  onChange: (selection: AiSelection) => void;
  /** The models of every connection the picker has heard of so far. */
  modelsByConnection: Record<string, AiModel[]>;
  /** The reader's own connections (API keys, endpoints, this device); never the platform one. */
  connections: Array<{ id: string; label: string }>;
  /** A connection's submenu was opened: its models may not be loaded yet. */
  onNeedModels?: (connectionId: string) => void;
}

const OTHER = "other";
const OLDER = "older";
const connectionPath = (id: string) => `conn:${id}`;

/** The focusable rows of one panel; a hidden one (the back row on a wide screen) is skipped. */
function itemsOf(panel: Element): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>("[data-menu-item]")).filter(
    (item) => item.closest("[data-menu-panel]") === panel && item.getClientRects().length > 0,
  );
}

export const ModelMenu: React.FC<Props> = ({ value, onChange, modelsByConnection, connections, onNeedModels }) => {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const [starred, setStarred] = useState<string[]>(readStarred);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Escape closes through the popover's own listener, which cannot tell it from a click outside.
  const closedByKey = useRef(false);
  // In a ref: a parent that rebuilds the callback must not pull the focus back to the panel.
  const needModelsRef = useRef(onNeedModels);
  useEffect(() => {
    needModelsRef.current = onNeedModels;
  }, [onNeedModels]);

  const menu = useMemo(
    () =>
      buildModelMenu({
        selection: value,
        platformModels: modelsByConnection[PLATFORM_CONNECTION_ID] ?? [],
        connections: connections.map((connection) => ({ ...connection, models: modelsByConnection[connection.id] ?? [] })),
        starred,
      }),
    [value, connections, modelsByConnection, starred],
  );
  const label = pillLabel(value, modelsByConnection);

  const focusPill = () => anchorRef.current?.querySelector("button")?.focus();
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setPath([]);
    if (restoreFocus) requestAnimationFrame(focusPill);
  };
  const dismiss = () => {
    close(closedByKey.current);
    closedByKey.current = false;
  };

  // Focus the checked row (or the first) of the panel that just opened.
  useEffect(() => {
    if (!open) return;
    const panel = rootRef.current?.querySelectorAll("[data-menu-panel]")[path.length];
    if (!panel) return;
    const items = itemsOf(panel);
    (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus({ preventScroll: true });
    const last = path[path.length - 1];
    if (last?.startsWith("conn:")) needModelsRef.current?.(last.slice(5));
  }, [open, path]);

  const pick = (row: ModelRow) => {
    if (!(row.connectionId === value.connectionId && row.model === value.model)) onChange({ connectionId: row.connectionId, model: row.model });
    close(true);
  };
  const pickAuto = () => {
    const platformModels = modelsByConnection[PLATFORM_CONNECTION_ID] ?? [];
    const chosen = platformModels.find((model) => model.default) ?? platformModels[0];
    onChange({ connectionId: PLATFORM_CONNECTION_ID, model: chosen?.id ?? "" });
    close(true);
  };
  const star = (row: ModelRow) => {
    const next = toggleStarred(starred, row.model);
    setStarred(next);
    writeStarred(next);
  };
  const openSub = (depth: number, id: string) => setPath((current) => [...current.slice(0, depth), id]);
  const closeSub = (depth: number) => {
    const trigger = path[depth - 1];
    setPath((current) => current.slice(0, depth - 1));
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-submenu="${trigger}"]`)?.focus({ preventScroll: true }));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const panel = target.closest<HTMLElement>("[data-menu-panel]");
    if (!panel) return;
    const depth = Number(panel.dataset.menuDepth);
    const items = itemsOf(panel).filter((item) => !item.hasAttribute("data-menu-star"));
    const index = items.indexOf(target);
    const move = (to: number) => { event.preventDefault(); items[(to + items.length) % items.length]?.focus({ preventScroll: true }); };
    const sibling = target.parentElement?.querySelector<HTMLElement>(target.hasAttribute("data-menu-star") ? "[role=menuitemradio]" : "[data-menu-star]");
    switch (event.key) {
      case "ArrowDown": return move(index + 1);
      case "ArrowUp": return move(index < 0 ? items.length - 1 : index - 1);
      case "Home": return move(0);
      case "End": return move(items.length - 1);
      case "ArrowRight":
        event.preventDefault();
        if (target.dataset.submenu) openSub(depth, target.dataset.submenu);
        else if (!target.hasAttribute("data-menu-star")) sibling?.focus({ preventScroll: true });
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (target.hasAttribute("data-menu-star")) sibling?.focus({ preventScroll: true });
        else if (depth > 0) closeSub(depth);
        return;
      case "Escape":
        if (depth > 0) {
          event.preventDefault();
          event.nativeEvent.stopPropagation();
          closeSub(depth);
        } else closedByKey.current = true;
        return;
      case "Tab":
        close(false);
        return;
      default:
    }
  };

  const other = menu.groups.length > 0 || menu.older.length > 0;
  const subOpen = (id: string) => path.includes(id);
  return (
    <>
      <span ref={anchorRef} className="inline-flex" data-testid="ai-model-pill">
        <Button
          tone="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Model: ${label}`}
          onClick={() => (open ? close(false) : setOpen(true))}
          className="max-w-44 rounded-full border border-[var(--osio-border-default)] px-3 text-xs"
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
        </Button>
      </span>
      <Popover anchorRef={anchorRef} open={open} onClose={dismiss} align="end">
        <div ref={rootRef} onKeyDown={onKeyDown}>
          <MenuPanel depth={0} title="Model">
            <AutoItem selected={menu.autoSelected} onPick={pickAuto} />
            {menu.recommended.length > 0 ? (
              <>
                <SectionLabel>Recommended</SectionLabel>
                {menu.recommended.map((row) => (
                  <ModelRowItem key={row.model} row={row} onPick={pick} onStar={row.starred ? star : undefined} />
                ))}
              </>
            ) : null}
            {other || menu.connections.length > 0 ? <Divider /> : null}
            {other ? (
              <SubmenuTrigger id={OTHER} open={subOpen(OTHER)} onOpen={() => openSub(0, OTHER)}>Other models</SubmenuTrigger>
            ) : null}
            {menu.connections.length > 0 ? <SectionLabel>Your connections</SectionLabel> : null}
            {menu.connections.map((connection) => (
              <SubmenuTrigger
                key={connection.id}
                id={connectionPath(connection.id)}
                open={subOpen(connectionPath(connection.id))}
                icon={<Plug size={14} aria-hidden="true" />}
                onOpen={() => openSub(0, connectionPath(connection.id))}
              >
                {connection.label}
              </SubmenuTrigger>
            ))}
          </MenuPanel>
          {subOpen(OTHER) ? (
            <MenuPanel depth={1} title="Other models" onBack={() => closeSub(1)}>
              {menu.groups.map((group) => (
                <div key={group.family} role="group" aria-label={group.heading}>
                  <SectionLabel>{group.heading}</SectionLabel>
                  {group.rows.map((row) => <ModelRowItem key={row.model} row={row} onPick={pick} />)}
                </div>
              ))}
              {menu.older.length > 0 ? (
                <>
                  <Divider />
                  <SubmenuTrigger id={OLDER} open={subOpen(OLDER)} onOpen={() => openSub(1, OLDER)}>Older models</SubmenuTrigger>
                </>
              ) : null}
            </MenuPanel>
          ) : null}
          {subOpen(OTHER) && subOpen(OLDER) ? (
            <MenuPanel depth={2} title="Older models" onBack={() => closeSub(2)}>
              {menu.older.map((row) => <ModelRowItem key={row.model} row={row} onPick={pick} onStar={star} />)}
            </MenuPanel>
          ) : null}
          {menu.connections.map((connection) =>
            subOpen(connectionPath(connection.id)) ? (
              <MenuPanel key={connection.id} depth={1} title={connection.label} onBack={() => closeSub(1)}>
                {connection.models.length > 0 ? (
                  connection.models.map((row) => <ModelRowItem key={row.model} row={row} onPick={pick} />)
                ) : (
                  <p role="presentation" className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">No models listed yet.</p>
                )}
              </MenuPanel>
            ) : null,
          )}
        </div>
      </Popover>
    </>
  );
};
