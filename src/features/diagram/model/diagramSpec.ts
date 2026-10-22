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

/** The most databases a schema diagram may hold: the ceiling of the spec. */
export const MAX_SCHEMA_DATABASES = 12;

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

/**
 * A page id: a server uuid, or the id a page carries before it is synced
 * (`local-page-<n>-<base36 time>`, src/store/pageStore.helpers.ts `localId`) —
 * the offline app has only those. Either way the id is a lookup key into the
 * reader's own store and is never emitted (the compiler generates node ids).
 */
const pageId = z.union([z.uuid(), z.string().regex(/^local-page-\d{1,9}-[0-9a-z]{1,12}$/)]);

/**
 * A database id: a lookup key into the VIEWER's own store, never emitted (the
 * compiler generates node ids).
 *
 * It is NOT a uuid: the databases the client holds are named by the app
 * itself — `db-tasks`, `db-crm`, `db-inline-1a2b3c4d` — so a uuid-only rule
 * refused every real database id. The rule is the same shape as the page id
 * above: a short, boring, lookup-key string. It reaches the diagram as a KEY
 * and never as text (the emitter writes `n0`, `n1`, …).
 */
const databaseId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/);

/** The schema of one to twelve databases the reader may see. */
const schemaSpec = z.strictObject({
  kind: z.literal("schema"),
  databaseIds: z.array(databaseId).min(1).max(MAX_SCHEMA_DATABASES),
  direction: direction.optional(),
  title,
});

/** The neighbourhood of one page: the links, mentions and relations around it. */
const graphSpec = z.strictObject({
  kind: z.literal("graph"),
  pageId,
  depth: z.union([z.literal(1), z.literal(2)]),
  kinds: z.array(z.enum(["link", "mention", "relation", "parent", "tag", "semantic"])),
  direction: direction.optional(),
  title,
});

/** The tree under one page, one to four levels deep. */
const hierarchySpec = z.strictObject({
  kind: z.literal("hierarchy"),
  rootPageId: pageId,
  depth: z.number().int().min(1).max(4),
  direction: direction.optional(),
  title,
});

/** The rows of one database, grouped by the value of one status property. */
const pipelineSpec = z.strictObject({
  kind: z.literal("pipeline"),
  databaseId,
  statusPropertyId: z.string().max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/),
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

/** The kinds the editor offers: the four a diagram can be drawn as. */
export type DiagramKind = "mermaid" | "hierarchy" | "schema" | "pipeline";

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

/**
 * The kind the editor shows for a spec.
 *
 * It reads the RAW spec, not the parsed one: a schema whose database list is
 * empty does not parse, and the editor must still show that it is a schema —
 * otherwise the author cannot go back and pick a database.
 *
 * The `graph` kind has no control yet — it needs a server read, and it is
 * the next slice — so the editor shows the mermaid kind for it. The block
 * itself still says that the kind is not available yet.
 */
export function diagramKind(spec: unknown): DiagramKind {
  const kind = (spec as { kind?: unknown } | null | undefined)?.kind;
  if (kind === "hierarchy" || kind === "schema" || kind === "pipeline") {
    return kind;
  }
  return "mermaid";
}
