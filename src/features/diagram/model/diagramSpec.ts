/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramSpec.ts                                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The CLOSED diagram spec (devil C108, C109).
 *
 * The AI (and the user) writes a SPEC, never pixels. This spec has five kinds
 * and NOTHING else: an unknown key is refused, there is no free query, there is
 * no SQL, and there is no way to name a table the reader may not read. What the
 * spec names is a PAGE, a DATABASE or a PROPERTY ID — the compiler turns those
 * into the data the viewer can already read, and nothing else.
 *
 * A spec is DATA: it is stored, shared and re-read. It never holds rendered
 * output (devil C110) — the block compiles it again, from the data of the
 * moment.
 */

import { z } from "zod";

/** The direction of the flowchart. One renderer path, one direction per diagram. */
const direction = z.enum(["LR", "TB"]);

/**
 * The title of a diagram. It is NOT front matter: the locked renderer strips a
 * front-matter block, so the block shows the title as TEXT next to the diagram.
 */
const title = z.string().max(120).optional();

/** Hand-written mermaid. It goes through the locked path like everything else. */
const mermaidSpec = z.strictObject({
  kind: z.literal("mermaid"),
  source: z.string().max(20_000),
  direction: direction.optional(),
  title,
});

/** The schema of one to twelve databases the reader may see. */
const schemaSpec = z.strictObject({
  kind: z.literal("schema"),
  databaseIds: z.array(z.uuid()).min(1).max(12),
  direction: direction.optional(),
  title,
});

/** The neighbourhood of one page: the links, mentions and relations around it. */
const graphSpec = z.strictObject({
  kind: z.literal("graph"),
  pageId: z.uuid(),
  depth: z.union([z.literal(1), z.literal(2)]),
  kinds: z.array(z.enum(["link", "mention", "relation", "parent", "tag", "semantic"])),
  direction: direction.optional(),
  title,
});

/** The tree under one page, one to four levels deep. */
const hierarchySpec = z.strictObject({
  kind: z.literal("hierarchy"),
  rootPageId: z.uuid(),
  depth: z.number().int().min(1).max(4),
  direction: direction.optional(),
  title,
});

/** The rows of one database, grouped by the value of one status property. */
const pipelineSpec = z.strictObject({
  kind: z.literal("pipeline"),
  databaseId: z.uuid(),
  statusPropertyId: z.string().max(80),
  direction: direction.optional(),
  title,
});

/** The closed spec: five kinds, and nothing else. */
export const diagramSpecSchema = z.discriminatedUnion("kind", [
  mermaidSpec,
  schemaSpec,
  graphSpec,
  hierarchySpec,
  pipelineSpec,
]);

export type DiagramSpec = z.infer<typeof diagramSpecSchema>;
export type MermaidDirection = z.infer<typeof direction>;

export type DiagramSpecResult =
  | { ok: true; spec: DiagramSpec }
  | { ok: false; error: string };

/**
 * Read a spec out of untrusted input (the AI's answer, a shared page, a stored
 * block). An unknown key, a wrong uuid, a depth out of range or a field that
 * smells like a query is REFUSED — never repaired, never guessed.
 */
export function parseDiagramSpec(input: unknown): DiagramSpecResult {
  const result = diagramSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };
  const error = result.error.issues
    .map((issue) => `${issue.path.join(".") || "spec"}: ${issue.message}`)
    .join("; ");
  return { ok: false, error };
}
