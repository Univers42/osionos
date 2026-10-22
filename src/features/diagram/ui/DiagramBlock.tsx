/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DiagramBlock.tsx                                   +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The diagram block: the SPEC, drawn live, through the ONE locked renderer.
 *
 * A diagram block stores a SPEC and never the rendered output (devil C110):
 * the block compiles the spec again, from the data the viewer already holds,
 * so a renamed page redraws and a page the reader may not read is never drawn.
 * On a PUBLIC page the block draws NOTHING and reads no other page: a
 * published page is a snapshot, and the tree of a shared workspace is not part
 * of it — it gets a text placeholder instead.
 *
 * The mermaid text always goes through `MermaidDiagram`, the locked renderer:
 * there is no second way to draw a diagram here.
 *
 * The two kinds drawn from the databases of the viewer (a schema, a pipeline)
 * are LAZY: they read the database store, which ships the seed of the app, and
 * a hand-written mermaid diagram must never pay for that chunk.
 */

import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { DEFAULT_DIAGRAM_SPEC } from "@/entities/block/model/diagramBlocks";
import type { Block } from "@/entities/block";

import { diagramKind, parseDiagramSpec, type DiagramKind } from "../model/diagramSpec";
import { diagramRenderMode } from "../model/diagramRenderMode";
import { useDiagramSource } from "./useDiagramSource";
import { useIsPublicPage } from "./useIsPublicPage";
import { DiagramOutput } from "./DiagramOutput";
import { DiagramToolbar } from "./DiagramToolbar";

/** The two database kinds: drawn from the store, in a chunk of their own. */
const LazyDatabaseDiagram = lazy(() =>
  import("./DatabaseDiagram").then((module) => ({ default: module.DatabaseDiagram })),
);

interface DiagramBlockProps {
  block: Block;
  /** The page the block is on: the root of a "this page" page tree. */
  pageId?: string;
  /** Editable mode: the toolbar and the source editor. */
  editable?: boolean;
  /** The block's normal update path. */
  onUpdateBlock?: (updates: Partial<Block>) => void;
}

export const DiagramBlock: React.FC<DiagramBlockProps> = ({
  block,
  pageId,
  editable = false,
  onUpdateBlock,
}) => {
  const isPublic = useIsPublicPage();
  const spec = block.diagramSpec;
  const parsed = useMemo(() => parseDiagramSpec(spec), [spec]);
  const mode = useMemo(() => diagramRenderMode({ isPublic, spec }), [isPublic, spec]);
  const { source, truncated, error, unsupported } = useDiagramSource(spec, { isPublic });

  const title = parsed.ok ? parsed.spec.title : undefined;
  // The kind of the STORED spec: a spec that does not parse (a schema with no
  // database) still shows its kind, so the author can go back and fix it.
  const kind = diagramKind(spec);
  // A kind the toolbar cannot write yet: the database kinds name a database
  // of the store, so the lazy controls write them once they know it.
  const [pendingKind, setPendingKind] = useState<DiagramKind | null>(null);
  const shownKind = pendingKind ?? kind;
  useEffect(() => {
    if (pendingKind && kind === pendingKind) setPendingKind(null);
  }, [pendingKind, kind]);

  const treeSpec = parsed.ok && parsed.spec.kind === "hierarchy" ? parsed.spec : null;
  const mermaidSpec = parsed.ok && parsed.spec.kind === "mermaid" ? parsed.spec : null;
  // A spec that does not parse (a source over the cap) still shows its text:
  // the author edits it back under the cap instead of losing it from view.
  const rawSource = (spec as { source?: unknown } | null | undefined)?.source;
  const storedSource = mermaidSpec?.source ?? (typeof rawSource === "string" ? rawSource : "");
  const isMermaid = shownKind === "mermaid";
  const depth = treeSpec?.depth ?? 2;
  const rootPageId = treeSpec?.rootPageId ?? pageId;

  // The textarea holds a DRAFT: it is written to the block on blur, through
  // the block's normal update path, like every other block's text.
  const [draft, setDraft] = useState(storedSource);
  useEffect(() => {
    setDraft(storedSource);
  }, [storedSource]);

  const writeSpec = (next: unknown) => onUpdateBlock?.({ diagramSpec: next });
  // The title and the direction belong to the DIAGRAM, not to its kind: every
  // edit carries them along.
  const carry = (next: Record<string, unknown>): Record<string, unknown> => ({
    ...next,
    ...(title ? { title } : {}),
    ...(parsed.ok && parsed.spec.direction ? { direction: parsed.spec.direction } : {}),
  });

  const onKindChange = (value: string) => {
    if (value === "hierarchy") {
      if (!rootPageId) return;
      setPendingKind(null);
      writeSpec(carry({ kind: "hierarchy", rootPageId, depth }));
      return;
    }
    if (value === "schema" || value === "pipeline") {
      // The default of a database kind names a database of the store: the
      // lazy controls write it, once they have read the store.
      setPendingKind(value);
      return;
    }
    setPendingKind(null);
    writeSpec(carry({ kind: "mermaid", source: storedSource || DEFAULT_DIAGRAM_SPEC.source }));
  };

  if (mode === "placeholder") {
    return (
      <div className="my-0 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2">
        <span className="text-sm font-semibold text-[var(--osio-fg-default)]">Diagram</span>
        {title ? (
          <span className="ml-2 text-sm text-[var(--osio-fg-subtle)]">{title}</span>
        ) : null}
      </div>
    );
  }

  const isDatabase = kind === "schema" || kind === "pipeline";
  const body = isDatabase ? (
    <Suspense fallback={null}>
      <LazyDatabaseDiagram spec={spec} />
    </Suspense>
  ) : (
    <DiagramOutput source={source} truncated={truncated} error={error} unsupported={unsupported} />
  );

  return (
    <div className="my-0 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      {editable ? (
        <DiagramToolbar
          kind={shownKind}
          parsed={parsed.ok ? parsed.spec : null}
          pageId={pageId}
          onKindChange={onKindChange}
          onWrite={(next) => writeSpec(carry(next))}
        />
      ) : null}
      {title ? (
        <p className="px-3 pt-2 text-sm font-semibold text-[var(--osio-fg-default)]">{title}</p>
      ) : null}
      {editable && isMermaid ? (
        <textarea
          aria-label="Mermaid source"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === storedSource) return;
            writeSpec(carry({ kind: "mermaid", source: draft }));
          }}
          rows={Math.min(12, Math.max(3, draft.split("\n").length + 1))}
          spellCheck={false}
          className="mx-3 my-2 w-[calc(100%-1.5rem)] resize-y rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-canvas)] p-2 font-mono text-xs text-[var(--osio-fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40"
        />
      ) : null}
      {body}
    </div>
  );
};
