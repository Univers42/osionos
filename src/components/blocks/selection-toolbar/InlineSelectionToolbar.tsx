/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   InlineSelectionToolbar.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { ColorPickerPreset } from "@univers42/ui-collection";
import type { InlineColorOption } from "@/shared/ui/assets/inlineTextStyles";
import type { InlineEditorSelectionSnapshot as SelectionSnapshot } from "@osionos/markdown-engine/dom";
import { useCommentsPanelStore } from "@/features/comments/model/commentsPanelStore";
import { AiEditRow, AiSkillsSection, type AskAiHandler } from "./AiMenu";
import { FormatGrid } from "./FormatGrid";
import {
  ToolbarRowButton,
  ToolbarSeparator,
  TOOLBAR_ICON,
} from "./ToolbarButton";
import {
  InlineColorPalettePanel,
  ShortcutsPanel,
  type PaletteKind,
} from "./ToolbarPopovers";
import { TurnIntoMenu } from "./TurnIntoMenu";

export type { PaletteKind };

interface InlineSelectionToolbarProps {
  selection: SelectionSnapshot;
  palette: PaletteKind | null;
  colorPresets: ColorPickerPreset[];
  defaultColor: string;
  shortcutsOpen: boolean;
  onTogglePalette: (palette: PaletteKind) => void;
  onToggleShortcuts: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onFormatStrike: () => void;
  onFormatCode: () => void;
  onFormatUnderline: () => void;
  onFormatTextColor: (color: InlineColorOption) => void;
  onFormatBackgroundColor: (color: InlineColorOption) => void;
  onOpenSlashMenu: () => void;
  onOpenLinkPicker: () => void;
  onClearFormat: () => void;
  onToggleMath: () => void;
  onClose: () => void;
  blockType?: string;
  blockId?: string;
  pageId?: string;
  onTurnInto?: (type: string) => void;
  /** The text the user had selected — the AI works on THAT, not on the block. */
  selectionText?: string;
  /** Opens the AI panel on the selection, or runs a skill immediately. */
  onAskAI?: AskAiHandler;
}

const PANEL_WIDTH = 252;
const EDGE = 8;
const GAP = 8;
const END_OFFSET = 24;

const InlineSelectionToolbarImpl: React.FC<InlineSelectionToolbarProps> = ({
  selection,
  palette,
  colorPresets,
  defaultColor,
  shortcutsOpen,
  onTogglePalette,
  onToggleShortcuts,
  onFormatBold,
  onFormatItalic,
  onFormatStrike,
  onFormatCode,
  onFormatUnderline,
  onFormatTextColor,
  onFormatBackgroundColor,
  onOpenSlashMenu,
  onOpenLinkPicker,
  onClearFormat,
  onToggleMath,
  onClose,
  blockType,
  blockId,
  pageId,
  onTurnInto,
  selectionText,
  onAskAI,
}) => {
  const canComment = Boolean(pageId && blockId);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(-1);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  // Measured after commit and before paint: the first frame already sits below
  // the selection (or above it when the panel would cross the bottom edge).
  // Writing the position straight to the node avoids a second render between
  // mouseup and the first painted frame.
  useLayoutEffect(() => {
    const panel = rootRef.current;
    if (!panel) return;
    const height = panel.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.min(
      Math.max(EDGE, selection.rect.right - END_OFFSET),
      viewportWidth - PANEL_WIDTH - EDGE,
    );
    let top = selection.rect.bottom + GAP;
    if (top + height > viewportHeight - EDGE) {
      const above = selection.rect.top - GAP - height;
      top = above >= EDGE ? above : Math.max(EDGE, viewportHeight - height - EDGE);
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }, [selection.rect.bottom, selection.rect.top, selection.rect.right, canComment, onAskAI]);

  const paintActive = useCallback((index: number) => {
    const root = rootRef.current;
    if (!root) return;
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        "[data-selection-panel-control]:not([disabled])",
      ),
    ).filter((button) => button.offsetParent !== null);
    buttons.forEach((button, position_) => {
      if (position_ === index) button.setAttribute("data-kb-active", "true");
      else button.removeAttribute("data-kb-active");
    });
    activeIndexRef.current = index;
  }, []);

  const close = useCallback(() => {
    paintActive(-1);
    setTurnIntoOpen(false);
    onClose();
  }, [onClose, paintActive]);

  // The panel never takes focus: Tab and the arrow keys move a highlight over
  // its controls, Enter runs the highlighted one, Escape dismisses the panel.
  // Shift/Alt/Cmd/Ctrl arrows are left to the editor (they extend or move the
  // selection, which is how the panel was opened in the first place).
  useEffect(() => {
    if (turnIntoOpen) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const buttons = () =>
      Array.from(
        root.querySelectorAll<HTMLButtonElement>(
          "[data-selection-panel-control]:not([disabled])",
        ),
      ).filter((button) => button.offsetParent !== null);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      // Shift+Arrow extends the selection in the editor; Alt/Cmd/Ctrl+Arrow
      // moves by word or line. Only Tab honours Shift (backwards navigation).
      if (event.key !== "Tab" && (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.key === "Tab" && (event.altKey || event.metaKey || event.ctrlKey)) return;
      const list = buttons();
      if (list.length === 0) return;
      if (event.key === "Tab" || event.key === "ArrowDown" || event.key === "ArrowRight") {
        const direction = event.key === "Tab" && event.shiftKey ? -1 : 1;
        const current = activeIndexRef.current;
        const index = current < 0 ? 0 : (current + direction + list.length) % list.length;
        if (event.key === "ArrowRight" && list[current]?.title === "Turn into") {
          setTurnIntoOpen(true);
        } else {
          paintActive(index);
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        const current = activeIndexRef.current;
        paintActive(current < 0 ? list.length - 1 : (current - 1 + list.length) % list.length);
      } else if (event.key === "Enter" || event.key === " ") {
        const current = activeIndexRef.current;
        if (current < 0) return;
        list[current]?.click();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      paintActive(-1);
    };
  }, [close, paintActive, turnIntoOpen]);

  return (
    <div
      ref={rootRef}
      data-testid="inline-selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      className="fixed z-[var(--osio-z-max)] osio-surface-overlay animate-[osio-slash-menu-in_200ms_var(--osio-ease-emphasized)] motion-reduce:animate-none"
      style={{
        left: 0,
        top: 0,
        width: PANEL_WIDTH,
        padding: 6,
        borderRadius: 12,
        visibility: "hidden",
      }}
      onMouseDownCapture={(event) => event.preventDefault()}
      onPointerDownCapture={(event) => event.preventDefault()}
    >
      {blockType && onTurnInto ? (
        <>
          <TurnIntoMenu
            blockType={blockType}
            onTurnInto={onTurnInto}
            open={turnIntoOpen}
            onOpenChange={setTurnIntoOpen}
          />
          <ToolbarSeparator />
        </>
      ) : null}

      <FormatGrid
        palette={palette}
        shortcutsOpen={shortcutsOpen}
        onTogglePalette={onTogglePalette}
        onToggleShortcuts={onToggleShortcuts}
        onFormatBold={onFormatBold}
        onFormatItalic={onFormatItalic}
        onFormatStrike={onFormatStrike}
        onFormatCode={onFormatCode}
        onFormatUnderline={onFormatUnderline}
        onOpenSlashMenu={onOpenSlashMenu}
        onOpenLinkPicker={onOpenLinkPicker}
        onClearFormat={onClearFormat}
        onToggleMath={onToggleMath}
      />
      <ToolbarSeparator />

      {canComment ? (
        <ToolbarRowButton
          title="Comment"
          onClick={() =>
            useCommentsPanelStore
              .getState()
              .openFor(pageId as string, blockId as string)
          }
        >
          <MessageSquare
            className={TOOLBAR_ICON}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="flex-1 truncate">Comment</span>
        </ToolbarRowButton>
      ) : null}

      {onAskAI ? (
        <>
          <AiSkillsSection
            selectionText={selectionText ?? ""}
            onAskAI={onAskAI}
          />
          <AiEditRow selectionText={selectionText ?? ""} onAskAI={onAskAI} />
        </>
      ) : null}
      {palette && (
        <InlineColorPalettePanel
          palette={palette}
          colorPresets={colorPresets}
          defaultColor={defaultColor}
          onPick={
            palette === "text" ? onFormatTextColor : onFormatBackgroundColor
          }
        />
      )}

      {shortcutsOpen && <ShortcutsPanel />}
    </div>
  );
};

/** Memoised: an unchanged selection rect must not re-render the panel. */
export const InlineSelectionToolbar = React.memo(InlineSelectionToolbarImpl);
