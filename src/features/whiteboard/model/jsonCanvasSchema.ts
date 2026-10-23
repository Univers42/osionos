/**
 * The zod schema of a JSON Canvas document: the one the parser reads with and the
 * export checks every emitted node and edge against.
 *
 * Coordinates and sizes are accepted as any finite number in range and rounded to an
 * integer, because the spec writes integers but Obsidian-adjacent tools write floats.
 */
import { z } from "zod";

import { MAX_IMPORT_ELEMENTS, MAX_TEXT_LENGTH } from "./boardLimits";
import {
  MAX_CANVAS_COORDINATE,
  MAX_CANVAS_ID_LENGTH,
  MAX_CANVAS_KEYWORD_LENGTH,
  MAX_CANVAS_PATH_LENGTH,
  MAX_CANVAS_SIZE,
} from "./jsonCanvasLimits";

/** A colour is a preset digit or a hex triple. Anything else is not a colour. */
const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$|^[1-6]$/);

/** Any finite number in `[min, max]`, read as the whole number nearest to it. Caveat:
 *  the range is checked before rounding, so 100000.4 is refused though it rounds in. */
const whole = (min: number, max: number) =>
  z.number().min(min).max(max).transform((value) => Math.round(value));

export const nodeSchema = z.object({
  id: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  // The type is read as a word, not as an enum: a node of a type this reader does not
  // know is dropped and counted, never a refusal of the whole canvas.
  type: z.string().max(MAX_CANVAS_KEYWORD_LENGTH).optional(),
  x: whole(-MAX_CANVAS_COORDINATE, MAX_CANVAS_COORDINATE),
  y: whole(-MAX_CANVAS_COORDINATE, MAX_CANVAS_COORDINATE),
  // 0.5 is the smallest size that rounds to the 1 the format needs.
  width: whole(0.5, MAX_CANVAS_SIZE),
  // 0.5 is the smallest size that rounds to the 1 the format needs.
  height: whole(0.5, MAX_CANVAS_SIZE),
  color: colourSchema.optional(),
  text: z.string().optional(),
  file: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  subpath: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  url: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  label: z.string().optional(),
  background: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  backgroundStyle: z.string().max(MAX_CANVAS_KEYWORD_LENGTH).optional(),
});

export const edgeSchema = z.object({
  id: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  fromNode: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  toNode: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  fromEnd: z.enum(["none", "arrow"]).optional(),
  toEnd: z.enum(["none", "arrow"]).optional(),
  color: colourSchema.optional(),
  label: z.string().max(MAX_TEXT_LENGTH).optional(),
});

export const canvasSchema = z.object({
  nodes: z.array(nodeSchema).max(MAX_IMPORT_ELEMENTS, `holds more than the ${MAX_IMPORT_ELEMENTS} a board holds at most`).optional(),
  edges: z.array(edgeSchema).max(MAX_IMPORT_ELEMENTS, `holds more than the ${MAX_IMPORT_ELEMENTS} a board holds at most`).optional(),
});


/** Whether a node or edge this export built is one the importer would read back.
 *  Text and group captions are capped by the parser rather than the schema, so they
 *  are checked here too. */
export function isReadable(item: unknown, kind: "node" | "edge"): boolean {
  if (!(kind === "node" ? nodeSchema : edgeSchema).safeParse(item).success) return false;
  const { text, label } = item as { text?: string; label?: string };
  return (text?.length ?? 0) <= MAX_TEXT_LENGTH && (label?.length ?? 0) <= MAX_TEXT_LENGTH;
}
