/**
 * Small presentational console widgets. Data-driven colors are rendered as inline
 * SVG `fill` attributes (a presentation attribute, NOT a CSS `style`) so the
 * console stays CSP-safe with no inline styles.
 */

import type { ReactElement } from "react";
import type { NodeShape } from "../../core/render/nodeShape";

export function ColorDot({ color, size = 11 }: { color: string; size?: number }): ReactElement {
  return (
    <svg className="osio-gc-dot" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill={color || "currentColor"} />
    </svg>
  );
}

/** The node "shape language" rendered as a tiny glyph for the kind legend. */
export function ShapeGlyph({ shape, size = 12 }: { shape: NodeShape; size?: number }): ReactElement {
  return (
    <svg className="osio-gc-dot" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {shape === "ring" ? (
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      ) : (
        <circle cx="6" cy="6" r="5" fill="currentColor" />
      )}
      {shape === "note" && <circle cx="6" cy="6" r="2.1" fill="none" stroke="var(--osio-bg-panel)" strokeWidth="1.6" />}
    </svg>
  );
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function Slider(props: SliderProps): ReactElement {
  return (
    <label className="osio-gc-slider">
      <span className="osio-gc-slider__top">
        <span>{props.label}</span>
        <span className="osio-gc-slider__val">{props.format ? props.format(props.value) : props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
  /** A shape glyph shown instead of the color dot (used by the kind legend). */
  glyph?: ReactElement;
  count?: number;
}

export function Toggle(props: ToggleProps): ReactElement {
  return (
    <label className="osio-gc-toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      {props.glyph ?? (props.color !== undefined && <ColorDot color={props.color} />)}
      <span className="osio-gc-toggle__label">{props.label}</span>
      {props.count !== undefined && <span className="osio-gc-count">{props.count}</span>}
    </label>
  );
}
