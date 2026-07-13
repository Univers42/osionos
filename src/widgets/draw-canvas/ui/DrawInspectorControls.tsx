/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawInspectorControls.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The inspector's native form primitives — swatch rows, segmented buttons,
 * icon-button rows — shared by every DrawInspector section. Native controls
 * only: no portaled dropdowns, everything keyboard- and screen-reader-plain.
 */

import type { ReactNode } from "react";

export function toHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1e1e1e";
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--osio-fg-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

export function Swatches({
  value,
  presets,
  allowTransparent,
  onPick,
}: {
  value: string;
  presets: string[];
  allowTransparent?: boolean;
  onPick: (color: string) => void;
}) {
  const dot = (active: boolean): React.CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    cursor: "pointer",
    border: active ? "2px solid var(--osio-accent)" : "1px solid var(--osio-border-soft)",
  });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {allowTransparent ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Transparent"
          aria-pressed={value === "transparent"}
          onClick={() => onPick("transparent")}
          style={{ ...dot(value === "transparent"), background: "repeating-conic-gradient(#c0c0c0 0% 25%, #fff 0% 50%) 50% / 8px 8px" }}
        />
      ) : null}
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          aria-label={color}
          aria-pressed={value === color}
          onClick={() => onPick(color)}
          style={{ ...dot(value === color), background: color }}
        />
      ))}
      <input
        type="color"
        aria-label="Custom color"
        value={toHex(value)}
        onChange={(event) => onPick(event.target.value)}
        style={{ width: 26, height: 24, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onPick,
  ariaLabel,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onPick: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "flex", gap: 4 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
          onMouseDown={(event) => event.preventDefault()}
            aria-pressed={active}
            onClick={() => onPick(option.value)}
            style={{
              flex: 1,
              height: 30,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              border: "1px solid var(--osio-border-soft)",
              color: active ? "var(--osio-accent)" : "var(--osio-fg-default)",
              background: active ? "var(--osio-accent-subtle)" : "var(--osio-bg-surface)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A row of equal icon buttons (arrange / align rows). */
export function IconRow({
  buttons,
}: {
  buttons: Array<{ label: string; Icon: React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>; onPick: () => void }>;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {buttons.map(({ label, Icon, onPick }) => (
        <button
          key={label}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          aria-label={label}
          title={label}
          onClick={onPick}
          style={{
            flex: 1,
            height: 30,
            display: "grid",
            placeItems: "center",
            borderRadius: 6,
            cursor: "pointer",
            border: "1px solid var(--osio-border-soft)",
            color: "var(--osio-fg-default)",
            background: "var(--osio-bg-surface)",
          }}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  );
}
