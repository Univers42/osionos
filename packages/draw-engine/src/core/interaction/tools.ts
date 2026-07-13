/**
 * The tool set and the keyboard-first hotkey map. Keyboard-first is a headline
 * goal: every tool has a single-key shortcut. Pure — no DOM.
 */

export type DrawTool =
  | "select"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser";

/** Tools that create a bounding-box shape on drag (rendered by paint.ts today). */
export const BBOX_SHAPE_TOOLS = new Set<DrawTool>(["rectangle", "diamond", "ellipse"]);

export function isShapeTool(tool: DrawTool): tool is "rectangle" | "diamond" | "ellipse" {
  return BBOX_SHAPE_TOOLS.has(tool);
}

/** Tools that create a two-point linear element on drag, whose ends can bind to shapes. */
export const LINEAR_TOOLS = new Set<DrawTool>(["line", "arrow"]);

export function isLinearTool(tool: DrawTool): tool is "line" | "arrow" {
  return LINEAR_TOOLS.has(tool);
}

/** Single-key shortcuts (Excalidraw-compatible numbers + letters). */
const HOTKEYS: Record<string, DrawTool> = {
  "1": "select",
  v: "select",
  "2": "rectangle",
  r: "rectangle",
  "3": "diamond",
  d: "diamond",
  "4": "ellipse",
  o: "ellipse",
  "5": "arrow",
  a: "arrow",
  "6": "line",
  l: "line",
  "7": "freedraw",
  p: "freedraw",
  "8": "text",
  t: "text",
  e: "eraser",
  h: "hand",
};

/** Map a keyboard key to a tool (case-insensitive), or null if unbound. */
export function toolForKey(key: string): DrawTool | null {
  return HOTKEYS[key.toLowerCase()] ?? null;
}
