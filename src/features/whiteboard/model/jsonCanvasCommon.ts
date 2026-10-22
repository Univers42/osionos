/**
 * The vocabulary a JSON Canvas and the board's elements share: the colours of the
 * format, the boxes and sides an edge runs along, and the rules that say what a
 * label means.
 */
import type { CanvasNode, CanvasSide } from "./jsonCanvas";

/** The preset colours of the canvas format, in the order the spec numbers them. The
 *  spec leaves the values to the application; these are the app's own. */
export const CANVAS_PRESET_COLOURS: Record<string, string> = {
  "1": "#e03131",
  "2": "#f08c00",
  "3": "#fab005",
  "4": "#2f9e44",
  "5": "#0c8599",
  "6": "#9c36b5",
};

/** The colour a shape gets when the canvas says nothing, or says something that is
 *  not a colour: the board's own default ink. */
export const DEFAULT_STROKE_COLOUR = "#1e1e1e";

/** The shapes a canvas node can become. A bound text is not one of them: it is the
 *  label of the shape it is bound to. */
export const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond", "stickynote", "figure"]);

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const finite = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export const boxOf = (node: CanvasNode): Box => ({ x: node.x, y: node.y, width: node.width, height: node.height });

/** The stroke colour of a canvas colour: a preset or a hex triple, and the board's
 *  own ink for anything else. */
export function strokeColourOf(colour: string | undefined): string {
  if (!colour) return DEFAULT_STROKE_COLOUR;
  const preset = CANVAS_PRESET_COLOURS[colour];
  if (preset) return preset;
  return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : DEFAULT_STROKE_COLOUR;
}

/** The canvas colour of a stroke colour: the preset it came from, the hex itself,
 *  or nothing at all when it is not a colour the format carries. */
export function canvasColourOf(stroke: string | undefined): string | undefined {
  if (!stroke) return undefined;
  const preset = Object.entries(CANVAS_PRESET_COLOURS).find(([, hex]) => hex === stroke.toLowerCase());
  if (preset) return preset[0];
  return /^#[0-9a-fA-F]{6}$/.test(stroke) ? stroke : undefined;
}

/** An address a browser may open. Anything else — `javascript:`, `data:`, a path —
 *  is not shown and not kept. */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value);
}

/** A path as it is written in a vault: no spaces, and a name with an extension. */
export function isFilePath(value: string): boolean {
  if (value.length === 0 || value.length > 260 || /\s/.test(value)) return false;
  const name = value.split(/[\\/]/).pop() ?? "";
  return /\.[A-Za-z0-9]{1,10}$/.test(name);
}

/** The heading or block inside a file, as the canvas format writes it: after a `#`
 *  or a `^`. */
export function splitSubpath(path: string): { file: string; subpath?: string } {
  const match = /^(.*?)([#^].*)$/.exec(path);
  if (!match) return { file: path };
  return { file: match[1], subpath: match[2] };
}

/** The middle of one side of a box: where an edge leaves from. */
export function sidePoint(box: Box, side: CanvasSide): Point {
  if (side === "top") return { x: box.x + box.width / 2, y: box.y };
  if (side === "right") return { x: box.x + box.width, y: box.y + box.height / 2 };
  if (side === "bottom") return { x: box.x + box.width / 2, y: box.y + box.height };
  return { x: box.x, y: box.y + box.height / 2 };
}

/** The side of `from` that faces `to`: what an edge uses when the canvas names none. */
export function nearestSide(from: Box, to: Box): CanvasSide {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** The side of a box a point sits on: read back from the geometry when a board is
 *  exported again. */
export function sideAt(box: Box, point: Point): CanvasSide {
  let best: CanvasSide = "top";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const side of ["top", "right", "bottom", "left"] as CanvasSide[]) {
    const centre = sidePoint(box, side);
    const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = side;
    }
  }
  return best;
}

/** Does a box lie inside another one? A canvas group holds the nodes whose box is
 *  inside the group's own. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
