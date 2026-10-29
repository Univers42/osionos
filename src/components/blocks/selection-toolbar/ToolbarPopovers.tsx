/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToolbarPopovers.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  ColorPickerBoard,
  type ColorPickerPreset,
} from "@univers42/ui-collection";
import {
  getInlineColorOption,
  type InlineColorOption,
} from "@/shared/ui/assets/inlineTextStyles";

export type PaletteKind = "text" | "background";

interface InlineColorPalettePanelProps {
  palette: PaletteKind;
  colorPresets: ColorPickerPreset[];
  defaultColor: string;
  onPick: (color: InlineColorOption) => void;
}

/** The existing text/background colour board, anchored under the toolbar. */
export const InlineColorPalettePanel: React.FC<
  InlineColorPalettePanelProps
> = ({ palette, colorPresets, defaultColor, onPick }) => (
  <div
    data-testid={
      palette === "text"
        ? "inline-text-color-palette"
        : "inline-background-color-palette"
    }
    className="absolute left-0 top-full mt-2 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 w-45 h-60 shadow-osio-e4"
  >
    <ColorPickerBoard
      defaultValue={defaultColor}
      label={palette === "text" ? "Text color" : "Background color"}
      presets={colorPresets}
      showInput={false}
      size={158}
      variant="wheel"
      styles={{
        root: { fontSize: "13px" },
        header: { marginBottom: "0px" },
        eyebrow: { display: "none" },
        title: { fontSize: "14px", lineHeight: 1 },
        selectedValue: { display: "none" },
        presets: {
          gridTemplateColumns: "repeat(4, 14px)",
          justifyContent: "start",
          gap: "4px",
          marginTop: "5px",
          marginBottom: "0px",
          marginLeft: "0px",
          marginRight: "0px",
        },
        presetButton: {
          gap: 0,
          padding: "0px",
          width: "14px",
          minWidth: "14px",
          maxWidth: "14px",
          height: "14px",
          minHeight: "14px",
          maxHeight: "14px",
        },
        presetSwatch: { width: "14px", height: "14px" },
        presetLabel: { display: "none" },
      }}
      onChangeComplete={(value) => {
        const option = getInlineColorOption(value);
        if (option) onPick(option);
      }}
    />
  </div>
);

const SHORTCUTS: ReadonlyArray<{ label: string; keys: string }> = [
  { label: "Bold", keys: "Ctrl/Cmd + B" },
  { label: "Italic", keys: "Ctrl/Cmd + I" },
  { label: "Underline", keys: "Ctrl/Cmd + U" },
  { label: "Inline code", keys: "Ctrl/Cmd + E" },
  { label: "Strikethrough", keys: "Ctrl/Cmd + Shift + X" },
  { label: "Add link", keys: "Ctrl/Cmd + Shift + L" },
  { label: "Delete previous word", keys: "Ctrl + Backspace" },
];

/** The keyboard-shortcuts reference panel. */
export const ShortcutsPanel: React.FC = () => (
  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 shadow-osio-e4">
    <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
      Keyboard shortcuts
    </p>
    <ul className="space-y-1">
      {SHORTCUTS.map((shortcut) => (
        <li
          key={shortcut.label}
          className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]"
        >
          <span>{shortcut.label}</span>
          <span className="text-[var(--osio-fg-muted)]">{shortcut.keys}</span>
        </li>
      ))}
    </ul>
  </div>
);
