/**
 * A JSON Canvas and the board's own elements: what a canvas becomes.
 *
 * The board draws shapes with a text bound to them; the canvas format draws nodes
 * and edges. The mapping is:
 *
 * | canvas node      | board elements                                    |
 * |------------------|---------------------------------------------------|
 * | `text`           | a `rectangle` and a `text` bound to it            |
 * | `link`           | a `rectangle` and a `text` holding the address    |
 * | `file`           | a `rectangle` and a `text` holding the path       |
 * | `group`          | a `frame`, and `frameId` on the nodes inside it   |
 * | canvas edge      | an `arrow` bound at both ends, and its label      |
 *
 * Nothing is fetched and nothing is resolved: a link is text, a file path is text.
 * A link that is not an `http(s)` address is dropped and counted, so no board ever
 * carries a `javascript:` or `data:` address.
 */
import { MAX_ID_LENGTH } from "./boardLimits";
import {
  DEFAULT_STROKE_COLOUR,
  SHAPE_TYPES,
  boxOf,
  contains,
  isHttpUrl,
  nearestSide,
  sidePoint,
  strokeColourOf,
  type Box,
} from "./jsonCanvasCommon";
import type { Canvas, CanvasNode } from "./jsonCanvas";

/** The board's element, in the field set the service stores (the drawnosaurus
 *  contract's `drawElementSchema`). */
export interface BoardElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  roundness: number | null;
  seed: number;
  version: number;
  versionNonce: number;
  updated: number;
  isDeleted: boolean;
  points?: [number, number][];
  startBinding?: string | null;
  endBinding?: string | null;
  startArrowhead?: string;
  endArrowhead?: string;
  text?: string;
  fontSize?: number;
  containerId?: string | null;
  boundTextId?: string | null;
  frameId?: string | null;
  name?: string | null;
}

export interface CanvasElementResult {
  elements: BoardElement[];
  /** The nodes this reader could not read: a type it does not know, a file node
   *  without a path, a link that is not an `http(s)` address. */
  droppedNodes: number;
  /** The edges whose end is not a node of the canvas. */
  droppedEdges: number;
}

/** The room a bound label keeps from the shape it sits in. */
const LABEL_PADDING = 8;

/** The import has no clock: every element carries the same stamp, so the same file
 *  always converts to the same scene. */
const IMPORTED_AT = 0;

/** FNV-1a, 32 bits. The same id always gives the same seed and nonce. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

const seedOf = (id: string): number => hash(id) & 0x7fffffff;
const nonceOf = (id: string): number => hash(`${id}#nonce`) & 0x7fffffff;

/** An id the contract accepts: at most `MAX_ID_LENGTH` characters. */
function fit(id: string): string {
  if (id.length <= MAX_ID_LENGTH) return id;
  const suffix = `-${hash(id).toString(36)}`;
  return `${id.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
}

/** Mints the ids the board's elements carry: the canvas ids when they fit the
 *  contract, a derived one when they do not, and never the same id twice. */
export class IdMinter {
  private readonly used = new Set<string>();

  shape(canvasId: string): string {
    return this.take(canvasId.length <= MAX_ID_LENGTH ? canvasId : `jc-${hash(canvasId).toString(36)}`);
  }

  text(shapeId: string): string {
    return this.take(`${shapeId}-t`);
  }

  private take(base: string): string {
    // Every candidate is recorded, so no path hands the same id out twice. The search
    // ends: `used` is finite and each counter gives a different candidate.
    for (let counter = 1; ; counter += 1) {
      const candidate = fit(counter === 1 ? base : `${base}-${counter}`);
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        return candidate;
      }
    }
  }
}

/** What a node shows, or null when the node cannot be shown at all. */
function labelOfNode(node: CanvasNode): string | null {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "file") return node.file ? `${node.file}${node.subpath ?? ""}` : null;
  if (node.type === "link") return node.url && isHttpUrl(node.url) ? node.url : null;
  return null;
}

function baseElement(id: string, type: string, box: Box, strokeColor: string): BoardElement {
  return {
    id,
    type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    roundness: SHAPE_TYPES.has(type) ? 8 : null,
    seed: seedOf(id),
    version: 1,
    versionNonce: nonceOf(id),
    updated: IMPORTED_AT,
    isDeleted: false,
  };
}

/** The text bound to a shape, or to an arrow. */
function labelElement(id: string, containerId: string, text: string, box: Box): BoardElement {
  const element = baseElement(
    id,
    "text",
    {
      x: box.x + LABEL_PADDING,
      y: box.y + LABEL_PADDING,
      width: Math.max(1, box.width - LABEL_PADDING * 2),
      height: Math.max(1, box.height - LABEL_PADDING * 2),
    },
    DEFAULT_STROKE_COLOUR,
  );
  element.text = text;
  element.fontSize = 20;
  element.containerId = containerId;
  return element;
}

/**
 * The board elements a canvas becomes.
 *
 * The nodes come first, in the canvas's own order: the first node of a canvas is the
 * one at the bottom, and the board's elements are read in the order they are written.
 * A node this reader cannot read is dropped and counted; the rest of the canvas still
 * comes in.
 */
export function jsonCanvasToElements(canvas: Canvas): CanvasElementResult {
  const minter = new IdMinter();
  const elements: BoardElement[] = [];
  const elementById = new Map<string, BoardElement>();
  /** The canvas id of a node → the board ids it became. */
  const idsByNode = new Map<string, string[]>();
  const boxesByNode = new Map<string, Box>();
  const frames: { id: string; box: Box }[] = [];
  let droppedNodes = 0;
  let droppedEdges = 0;

  for (const node of canvas.nodes) {
    if (node.type === "group") {
      const id = minter.shape(node.id);
      const frame = baseElement(id, "frame", boxOf(node), strokeColourOf(node.color));
      if (node.label) frame.name = node.label;
      elements.push(frame);
      frames.push({ id, box: boxOf(node) });
      idsByNode.set(node.id, [id]);
      boxesByNode.set(node.id, boxOf(node));
      elementById.set(id, frame);
      continue;
    }
    const label = labelOfNode(node);
    if (label === null) {
      droppedNodes += 1;
      continue;
    }
    const id = minter.shape(node.id);
    const labelId = minter.text(id);
    const shape = baseElement(id, "rectangle", boxOf(node), strokeColourOf(node.color));
    shape.boundTextId = labelId;
    const bound = labelElement(labelId, id, label, boxOf(node));
    elements.push(shape, bound);
    idsByNode.set(node.id, [id, labelId]);
    boxesByNode.set(node.id, boxOf(node));
    elementById.set(id, shape);
    elementById.set(labelId, bound);
  }

  // A group holds the nodes whose box lies inside its own, and the board says so
  // with the frame each of them belongs to. A node inside two groups belongs to the
  // inner one: that is the frame a reader sees around it.
  for (const [nodeId, ids] of idsByNode) {
    const box = boxesByNode.get(nodeId);
    if (!box) continue;
    const holding = frames.filter((frame) => !ids.includes(frame.id) && contains(frame.box, box));
    if (holding.length === 0) continue;
    const inner = holding.reduce(
      (smallest, frame) =>
        frame.box.width * frame.box.height < smallest.box.width * smallest.box.height ? frame : smallest,
      holding[0],
    );
    for (const id of ids) {
      const element = elementById.get(id);
      if (element) element.frameId = inner.id;
    }
  }

  for (const edge of canvas.edges) {
    const fromId = idsByNode.get(edge.fromNode)?.[0];
    const toId = idsByNode.get(edge.toNode)?.[0];
    const fromBox = boxesByNode.get(edge.fromNode);
    const toBox = boxesByNode.get(edge.toNode);
    if (!fromId || !toId || !fromBox || !toBox) {
      droppedEdges += 1;
      continue;
    }
    const fromSide = edge.fromSide ?? nearestSide(fromBox, toBox);
    const toSide = edge.toSide ?? nearestSide(toBox, fromBox);
    const id = minter.shape(edge.id);
    const start = sidePoint(fromBox, fromSide);
    const end = sidePoint(toBox, toSide);
    const box = { x: start.x, y: start.y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    const arrow = baseElement(id, "arrow", box, strokeColourOf(edge.color));
    // A line's x and y are its first point, not a corner: the points run from there.
    arrow.points = [
      [0, 0],
      [end.x - start.x, end.y - start.y],
    ];
    arrow.startBinding = fromId;
    arrow.endBinding = toId;
    arrow.startArrowhead = edge.fromEnd ?? "none";
    arrow.endArrowhead = edge.toEnd ?? "arrow";
    elements.push(arrow);
    elementById.set(id, arrow);
    if (edge.label) {
      const labelId = minter.text(id);
      const bound = labelElement(labelId, id, edge.label, {
        x: (start.x + end.x) / 2 - 50,
        y: (start.y + end.y) / 2 - 12.5,
        width: 100,
        height: 25,
      });
      arrow.boundTextId = labelId;
      elements.push(bound);
      elementById.set(labelId, bound);
    }
  }

  return { elements, droppedNodes, droppedEdges };
}
