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
 * The format grid: standard 36x36px icon cells with dedicated text-colour
 * and background-colour buttons, satisfying WCAG 2.2 SC 2.5.8 touch targets.
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
  <div
    data-testid="selection-format-grid"
    className="grid grid-cols-6 justify-items-center gap-y-1"
  >
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
