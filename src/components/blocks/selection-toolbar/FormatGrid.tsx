/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   FormatGrid.tsx                                     :+:      :+:    :+:   */
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
  Link,
  Radical,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";
import type { PaletteKind } from "./ToolbarPopovers";
import { ToolbarIconButton, TOOLBAR_ICON } from "./ToolbarButton";
import { MoreMenu } from "./MoreMenu";

interface FormatGridProps {
  palette: PaletteKind | null;
  shortcutsOpen: boolean;
  onTogglePalette: (palette: PaletteKind) => void;
  onToggleShortcuts: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onFormatStrike: () => void;
  onFormatCode: () => void;
  onFormatUnderline: () => void;
  onOpenSlashMenu: () => void;
  onOpenLinkPicker: () => void;
  onClearFormat: () => void;
  onToggleMath: () => void;
}

/**
 * The 5 x 2 grid from the reference panel. The text-colour cell keeps today's
 * background-colour action as the small highlighter in its lower-right corner:
 * Notion folds both palettes into one "A", and the existing action stays
 * reachable instead of becoming a dead menu row.
 */
export const FormatGrid: React.FC<FormatGridProps> = ({
  palette,
  shortcutsOpen,
  onTogglePalette,
  onToggleShortcuts,
  onFormatBold,
  onFormatItalic,
  onFormatStrike,
  onFormatCode,
  onFormatUnderline,
  onOpenSlashMenu,
  onOpenLinkPicker,
  onClearFormat,
  onToggleMath,
}) => (
  <div className="grid grid-cols-5 justify-items-center gap-y-1">
    <div className="relative h-9 w-9">
      <ToolbarIconButton
        label="Text color"
        active={palette === "text"}
        onClick={() => onTogglePalette("text")}
      >
        <Baseline className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
      </ToolbarIconButton>
      <button
        type="button"
        title="Background color"
        aria-label="Background color"
        aria-pressed={palette === "background"}
        data-selection-panel-control
        className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-sm text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-menu-item-hover-bg)] hover:text-[var(--osio-fg-default)] data-[kb-active=true]:bg-[var(--osio-menu-item-hover-bg)] data-[kb-active=true]:text-[var(--osio-fg-default)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onTogglePalette("background")}
      >
        <Highlighter className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </button>
    </div>

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

    <MoreMenu
      shortcutsOpen={shortcutsOpen}
      onToggleShortcuts={onToggleShortcuts}
      onOpenSlashMenu={onOpenSlashMenu}
    />
  </div>
);
