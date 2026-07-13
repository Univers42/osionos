/**
 * The drawing element model. Excalidraw-shaped: every element is a plain,
 * serialisable record carrying its own geometry, style, and version. Pure data —
 * no DOM, no rendering. Type-specific fields (arrow points/bindings, text runs,
 * image refs, frame children) are added by later phases; Phase 0 is the shared
 * base + the three bounds-defined shapes.
 */

export type DrawElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "image"
  | "frame"
  | "embed";

export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type StrokeStyle = "solid" | "dashed" | "dotted";

/** The tip shape at either end of a line/arrow — the vocabulary a relation diagram
 *  needs (UML/ERD): plain arrow, filled triangle, dot, hollow diamond, crow's foot… */
export type Arrowhead = "none" | "arrow" | "triangle" | "dot" | "diamond" | "bar";

export const ARROWHEADS: Arrowhead[] = ["none", "arrow", "triangle", "dot", "diamond", "bar"];

/** A single drawing element. `x,y` is the top-left corner in world space. */
export interface DrawElement {
  id: string;
  type: DrawElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in radians about the element centre. */
  angle: number;
  strokeColor: string;
  /** "transparent" or any CSS color. */
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  /** 0 = clean/geometric, 1–2 = hand-drawn (roughjs, wired in Phase 1). */
  roughness: number;
  /** 0–100. */
  opacity: number;
  /** Corner radius in px, or null for sharp corners. */
  roundness: number | null;
  /** Deterministic seed so the hand-drawn look is stable across redraws. */
  seed: number;
  /** Path points in element-local coords (origin = the element's x,y) — freedraw
   *  strokes and the two endpoints of a line/arrow. Undefined for bbox shapes. */
  points?: Array<[number, number]>;
  /** For line/arrow: the id of the shape this endpoint is BOUND to, if any. A bound
   *  endpoint is re-anchored to that shape's edge whenever the shape moves or
   *  resizes, which is what makes arrows "connect" two objects and follow them. */
  startBinding?: string | null;
  endBinding?: string | null;
  /** For line/arrow: the tip drawn at each end. Undefined = the type's default
   *  ("arrow" gets an arrow at the end; "line" gets none). */
  startArrowhead?: Arrowhead;
  endArrowhead?: Arrowhead;
  /** Text content + size for `type: "text"` elements. */
  text?: string;
  fontSize?: number;
  /** For `type: "text"`: the shape this text is a LABEL of. A contained label is
   *  kept centred inside its container and moves/resizes with it. */
  containerId?: string | null;
  /** For a shape: the id of its bound label, if it has one (the inverse link). */
  boundTextId?: string | null;
  /** Elements sharing a groupId select/move/delete as one unit. Single-level —
   *  nested groups (Excalidraw's groupIds array) only if a real need appears. */
  groupId?: string | null;
  /** A locked element renders but can't be selected, moved, or erased — only a
   *  right-click reaches it (to unlock). */
  locked?: boolean;
  /** Monotonic per-element counters — the basis for last-write-wins collab merge. */
  version: number;
  versionNonce: number;
  /** ms epoch of the last change. */
  updated: number;
  isDeleted: boolean;
}

/** The engine's neutral defaults; the app's inspector overrides these with
 *  theme-resolved values. (Explicit colors — a drawing's ink does not flip with
 *  the app theme; only the canvas backdrop does.) */
export const DEFAULT_ELEMENT_STYLE = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure" as FillStyle,
  strokeWidth: 2,
  strokeStyle: "solid" as StrokeStyle,
  roughness: 1,
  opacity: 100,
  roundness: 8 as number | null,
};

/** The editable style fields shared by the inspector, `setNextStyle`, and factories. */
export type DrawElementStyle = typeof DEFAULT_ELEMENT_STYLE;

let nonceCounter = 1;

function randInt(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function newElementId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `el-${randInt()}-${nonceCounter++}`;
}

/**
 * Build a fully-formed element. Callers pass geometry + style; the id/seed/nonce
 * and version stamps are filled here. `now` is injected so tests stay
 * deterministic (no hidden Date.now()).
 */
export function createElement(
  type: DrawElementType,
  geometry: { x: number; y: number; width: number; height: number },
  style: Partial<typeof DEFAULT_ELEMENT_STYLE> = {},
  now = 0,
): DrawElement {
  return {
    id: newElementId(),
    type,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    angle: 0,
    ...DEFAULT_ELEMENT_STYLE,
    ...style,
    seed: randInt(),
    version: 1,
    versionNonce: randInt(),
    updated: now,
    isDeleted: false,
  };
}

/** Produce the next version of an element after a mutation (bumps version stamps). */
export function bumpVersion(element: DrawElement, patch: Partial<DrawElement>, now = 0): DrawElement {
  return {
    ...element,
    ...patch,
    version: element.version + 1,
    versionNonce: randInt(),
    updated: now,
  };
}
