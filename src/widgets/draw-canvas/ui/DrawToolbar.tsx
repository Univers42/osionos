/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawToolbar.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Floating tool palette for the Draw surface. Each button is a 44×44 target with
 * an aria-label + hotkey hint; the active tool is `aria-pressed`.
 */

import { memo } from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
} from "lucide-react";
import type { DrawTool } from "@osionos/draw-engine";

interface ToolDef {
  tool: DrawTool;
  label: string;
  hotkey: string;
  Icon: typeof Square;
}

const TOOLS: ToolDef[] = [
  { tool: "select", label: "Select", hotkey: "V", Icon: MousePointer2 },
  { tool: "hand", label: "Pan", hotkey: "H", Icon: Hand },
  { tool: "rectangle", label: "Rectangle", hotkey: "R", Icon: Square },
  { tool: "diamond", label: "Diamond", hotkey: "D", Icon: Diamond },
  { tool: "ellipse", label: "Ellipse", hotkey: "O", Icon: Circle },
  { tool: "arrow", label: "Arrow", hotkey: "A", Icon: ArrowRight },
  { tool: "line", label: "Line", hotkey: "L", Icon: Minus },
  { tool: "freedraw", label: "Draw", hotkey: "P", Icon: Pencil },
  { tool: "text", label: "Text", hotkey: "T", Icon: Type },
  { tool: "eraser", label: "Eraser", hotkey: "E", Icon: Eraser },
];

const BAR_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 4,
  padding: 6,
  borderRadius: 12,
  background: "var(--osio-bg-panel)",
  border: "1px solid var(--osio-border-soft)",
  boxShadow: "var(--osio-shadow-md, 0 4px 16px rgba(0,0,0,0.12))",
};

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    color: active ? "var(--osio-accent)" : "var(--osio-fg-default)",
    background: active ? "var(--osio-accent-subtle)" : "transparent",
  };
}

function DrawToolbarImpl({
  active,
  onSelect,
  toolLocked,
  onToggleToolLock,
}: {
  active: DrawTool;
  onSelect: (tool: DrawTool) => void;
  toolLocked: boolean;
  onToggleToolLock: () => void;
}) {
  return (
    <div role="toolbar" aria-label="Drawing tools" style={BAR_STYLE}>
      {/* The padlock keeps the active tool armed after each shape — stamp out
          five rectangles without re-picking the tool (Excalidraw's Q). */}
      <button
        type="button"
          onMouseDown={(event) => event.preventDefault()}
        aria-label={`Keep tool active after drawing (Q) — ${toolLocked ? "on" : "off"}`}
        aria-pressed={toolLocked}
        title="Keep tool active — Q"
        onClick={onToggleToolLock}
        style={buttonStyle(toolLocked)}
      >
        {toolLocked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}
      </button>
      <div aria-hidden style={{ width: 1, alignSelf: "stretch", margin: "6px 2px", background: "var(--osio-border-soft)" }} />
      {TOOLS.map(({ tool, label, hotkey, Icon }) => (
        <button
          key={tool}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          aria-label={`${label} (${hotkey})`}
          aria-pressed={active === tool}
          title={`${label} — ${hotkey}`}
          onClick={() => onSelect(tool)}
          style={buttonStyle(active === tool)}
        >
          <Icon size={18} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Memoised: the hosts re-render on every rAF-coalesced camera flush, but the
 *  toolbar only changes with the active tool / lock (handlers are useCallback'd). */
export const DrawToolbar = memo(DrawToolbarImpl);
