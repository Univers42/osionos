/**
 * The canvas a board becomes.
 *
 * The board draws shapes with a text bound to them, and the canvas format draws
 * nodes and edges. A shape with a bound text becomes a node, a frame becomes a group,
 * and an arrow bound at both ends becomes an edge.
 *
 * The board format has no field that says which of the three kinds of node a shape
 * came from, so the export reads the label back: an `http(s)` address is a link, a
 * path with an extension is a file, anything else is text. Caveat: a text node whose
 * whole content is an address comes back as a link node — the label is all the board
 * keeps.
 *
 * A group holds the nodes whose box lies inside its own: the canvas format has no
 * other way to say it, so the export leaves the boxes to say it.
 */
import type { Canvas, CanvasEdge, CanvasNode } from "./jsonCanvas";
import { isReadable } from "./jsonCanvasSchema";
import {
  SHAPE_TYPES,
  canvasColourOf,
  finite,
  whole,
  isFilePath,
  isHttpUrl,
  sideAt,
  splitSubpath,
  type Box,
  type Point,
} from "./jsonCanvasCommon";

export interface CanvasExportResult {
  canvas: Canvas;
  /** The elements the canvas format cannot carry: a freehand stroke, a picture, an
   *  embed, a line with no ends. */
  skipped: number;
}

type Element = Record<string, unknown>;

/** The box an element sits in. */
function boxOfElement(element: Element): Box {
  return {
    x: finite(element.x),
    y: finite(element.y),
    width: finite(element.width),
    height: finite(element.height),
  };
}

/** One point of an element's point list, in world coordinates. */
function pointOf(points: unknown, index: number): Point {
  if (!Array.isArray(points)) return { x: 0, y: 0 };
  const point = points[index];
  if (!Array.isArray(point)) return { x: 0, y: 0 };
  return { x: finite(point[0]), y: finite(point[1]) };
}

/** The text an element shows: the text bound to it, or the text it carries itself. */
function labelOf(element: Element, byId: Map<string, Element>): string {
  const boundId = element.boundTextId;
  if (typeof boundId === "string") {
    const bound = byId.get(boundId);
    if (bound && typeof bound.text === "string") return bound.text;
  }
  if (typeof element.text === "string") return element.text;
  return "";
}

/** Which kind of node a label stands for. The heading a file path may carry is part of
 *  the path the label shows, so it is read apart before the path is judged. */
function kindOfLabel(label: string): "text" | "link" | "file" {
  if (isHttpUrl(label)) return "link";
  if (isFilePath(splitSubpath(label).file)) return "file";
  return "text";
}

/** A shape, or a free text, as a canvas node. */
function nodeOf(element: Element, byId: Map<string, Element>, kind?: "text"): CanvasNode {
  const label = kind === "text" ? (typeof element.text === "string" ? element.text : "") : labelOf(element, byId);
  const nodeKind = kind ?? kindOfLabel(label);
  const node: CanvasNode = {
    id: String(element.id),
    type: nodeKind,
    x: whole(element.x),
    y: whole(element.y),
    width: whole(element.width),
    height: whole(element.height),
  };
  const colour = canvasColourOf(typeof element.strokeColor === "string" ? element.strokeColor : undefined);
  if (colour) node.color = colour;
  if (nodeKind === "link") {
    node.url = label;
  } else if (nodeKind === "file") {
    const { file, subpath } = splitSubpath(label);
    node.file = file;
    if (subpath) node.subpath = subpath;
  } else {
    node.text = label;
  }
  return node;
}

/** A frame, as a canvas group. */
function groupOf(element: Element): CanvasNode {
  const node: CanvasNode = {
    id: String(element.id),
    type: "group",
    x: whole(element.x),
    y: whole(element.y),
    width: whole(element.width),
    height: whole(element.height),
  };
  if (typeof element.name === "string" && element.name !== "") node.label = element.name;
  const colour = canvasColourOf(typeof element.strokeColor === "string" ? element.strokeColor : undefined);
  if (colour) node.color = colour;
  return node;
}

/** An arrow bound at both ends, as a canvas edge. The sides come from where the
 *  arrow meets the two shapes. */
function edgeOf(element: Element, byId: Map<string, Element>): CanvasEdge | null {
  const fromId = element.startBinding;
  const toId = element.endBinding;
  if (typeof fromId !== "string" || typeof toId !== "string") return null;
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) return null;
  const points = element.points;
  const start = {
    x: finite(element.x) + pointOf(points, 0).x,
    y: finite(element.y) + pointOf(points, 0).y,
  };
  const end = {
    x: finite(element.x) + pointOf(points, 1).x,
    y: finite(element.y) + pointOf(points, 1).y,
  };
  const edge: CanvasEdge = {
    id: String(element.id),
    fromNode: fromId,
    toNode: toId,
    fromSide: sideAt(boxOfElement(from), start),
    toSide: sideAt(boxOfElement(to), end),
    fromEnd: element.startArrowhead === "arrow" ? "arrow" : "none",
    toEnd: element.endArrowhead === "arrow" ? "arrow" : "none",
  };
  const label = labelOf(element, byId);
  if (label !== "") edge.label = label;
  const colour = canvasColourOf(typeof element.strokeColor === "string" ? element.strokeColor : undefined);
  if (colour) edge.color = colour;
  return edge;
}

/**
 * The canvas a board becomes, and what it could not carry.
 *
 * A deleted element is gone: it is skipped, and it is not counted as lost — it was
 * never part of the board a reader sees.
 */
export function exportJsonCanvas(elements: readonly unknown[]): CanvasExportResult {
  const live = elements.filter((element) => (element as { isDeleted?: unknown } | null)?.isDeleted !== true);
  const byId = new Map<string, Element>();
  for (const element of live) {
    const id = (element as { id?: unknown } | null)?.id;
    if (typeof id === "string") byId.set(id, element as Element);
  }

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  let skipped = 0;
  for (const element of live) {
    const record = element as Element | null;
    if (!record || typeof record !== "object") {
      skipped += 1;
      continue;
    }
    const type = record.type;
    if (type === "text") {
      // A bound text is the label of the shape it is bound to, not a node of its own.
      if (typeof record.containerId === "string") {
        const container = byId.get(record.containerId);
        if (!container || !SHAPE_TYPES.has(String(container.type))) skipped += 1;
        continue;
      }
      nodes.push(nodeOf(record, byId, "text"));
      continue;
    }
    if (type === "frame") {
      nodes.push(groupOf(record));
      continue;
    }
    if (type === "arrow") {
      const edge = edgeOf(record, byId);
      if (edge) edges.push(edge);
      else skipped += 1;
      continue;
    }
    if (typeof type === "string" && SHAPE_TYPES.has(type)) {
      nodes.push(nodeOf(record, byId));
      continue;
    }
    // A freehand stroke, a picture, an embed, a line: the canvas format has no
    // node for them.
    skipped += 1;
  }

  // An element the importer would refuse (out of range, an oversized id or text) is
  // skipped rather than written into a file that cannot be read back. An edge whose
  // end was skipped goes with it.
  const readableNodes = nodes.filter((node) => isReadable(node, "node"));
  const nodeIds = new Set(readableNodes.map((node) => node.id));
  const readableEdges = edges.filter(
    (edge) => isReadable(edge, "edge") && nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode),
  );
  skipped += nodes.length - readableNodes.length + (edges.length - readableEdges.length);

  return { canvas: { nodes: readableNodes, edges: readableEdges }, skipped };
}

/** The canvas a board becomes. */
export function elementsToJsonCanvas(elements: readonly unknown[]): Canvas {
  return exportJsonCanvas(elements).canvas;
}

/** The name of the file a board is exported to: the board's own title, and the few
 *  characters a file name may not hold become a dash. */
export function canvasFileName(title: string): string {
  const name = title.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${name === "" ? "board" : name}.canvas`;
}
