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

import React from "react";
import {
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  Keyboard,
  Link,
  Radical,
  RemoveFormatting,
  Slash,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import type { ColorPickerPreset } from "@univers42/ui-collection";
import type { InlineColorOption } from "@/shared/ui/assets/inlineTextStyles";
import type { InlineEditorSelectionSnapshot as SelectionSnapshot } from "@osionos/markdown-engine/dom";
import { TurnIntoMenu } from "../TurnIntoMenu";
import {
  ToolbarDivider,
  ToolbarIconButton,
  TOOLBAR_ICON,
} from "./ToolbarButton";
import {
  InlineColorPalettePanel,
  ShortcutsPanel,
  type PaletteKind,
} from "./ToolbarPopovers";

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
  blockType?: string;
  onTurnInto?: (type: string) => void;
  /** The text the user had selected — the AI works on THAT, not on the block. */
  selectionText?: string;
  /** Opens the AI panel on the selection. */
  onAskAI?: (selectionText: string) => void;
}

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
  blockType,
  onTurnInto,
  selectionText,
  onAskAI,
}) => (
  <div
    data-testid="inline-selection-toolbar"
    className="fixed z-[var(--osio-z-max)] -translate-x-1/2"
    style={{
      left: selection.rect.left + selection.rect.width / 2,
      top: Math.max(12, selection.rect.top - 58),
    }}
    onMouseDownCapture={(event) => event.preventDefault()}
    onPointerDownCapture={(event) => event.preventDefault()}
  >
    <div className="relative rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-1 shadow-osio-e4">
      <div className="flex items-center gap-0.5">
        {blockType && onTurnInto ? (
          <>
            <TurnIntoMenu blockType={blockType} onTurnInto={onTurnInto} />
            <ToolbarDivider />
          </>
        ) : null}
        <ToolbarIconButton
          label="Text color"
          active={palette === "text"}
          onClick={() => onTogglePalette("text")}
        >
          <Baseline className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Background color"
          active={palette === "background"}
          onClick={() => onTogglePalette("background")}
        >
          <Highlighter className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Bold" onClick={onFormatBold}>
          <Bold className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Italic" onClick={onFormatItalic}>
          <Italic className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Underline" onClick={onFormatUnderline}>
          <Underline className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Clear formatting" onClick={onClearFormat}>
          <RemoveFormatting className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarDivider />
        <ToolbarIconButton label="Add link" onClick={onOpenLinkPicker}>
          <Link className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Strikethrough" onClick={onFormatStrike}>
          <Strikethrough className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Inline code" onClick={onFormatCode}>
          <Code className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Equation" onClick={onToggleMath}>
          <Radical className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarDivider />
        <ToolbarIconButton
          label="Keyboard shortcuts"
          active={shortcutsOpen}
          onClick={onToggleShortcuts}
        >
          <Keyboard className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Open slash menu" onClick={onOpenSlashMenu}>
          <Slash className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        {onAskAI ? (
          <>
            <ToolbarDivider />
            <ToolbarIconButton
              label="Ask AI"
              disabled={!selectionText}
              onClick={() => onAskAI(selectionText ?? "")}
            >
              <Sparkles className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
            </ToolbarIconButton>
          </>
        ) : null}
      </div>

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
  </div>
);

/** Memoised: an unchanged selection rect must not re-render the bar. */
export const InlineSelectionToolbar = React.memo(InlineSelectionToolbarImpl);
