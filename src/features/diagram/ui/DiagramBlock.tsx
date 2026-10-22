/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DiagramBlock.tsx                                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
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
 */

import React, { useEffect, useMemo, useState } from "react";

import { DEFAULT_DIAGRAM_SPEC } from "@/entities/block/model/diagramBlocks";
import type { Block } from "@/entities/block";
import { MermaidDiagram } from "@/shared/ui";

import { MAX_NODES } from "../model/diagramIR";
import { parseDiagramSpec } from "../model/diagramSpec";
import { diagramRenderMode } from "../model/diagramRenderMode";
import { useDiagramSource } from "./useDiagramSource";
import { useIsPublicPage } from "./useIsPublicPage";

interface DiagramBlockProps {
  block: Block;
  /** The page the block is on: the root of a "this page" page tree. */
  pageId?: string;
  /** Editable mode: the toolbar and the source editor. */
  editable?: boolean;
  /** The block's normal update path. */
  onUpdateBlock?: (updates: Partial<Block>) => void;
}
const CONTROL =
  "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40";

const DEPTHS = [1, 2, 3, 4];

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
  const treeSpec = parsed.ok && parsed.spec.kind === "hierarchy" ? parsed.spec : null;
  const mermaidSpec = parsed.ok && parsed.spec.kind === "mermaid" ? parsed.spec : null;
  const kind = treeSpec ? "hierarchy" : "mermaid";
  // A spec that does not parse (a source over the cap) still shows its text:
  // the author edits it back under the cap instead of losing it from view.
  const rawSource = (spec as { source?: unknown } | null | undefined)?.source;
  const storedSource = mermaidSpec?.source ?? (typeof rawSource === "string" ? rawSource : "");
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
      writeSpec(carry({ kind: "hierarchy", rootPageId, depth }));
      return;
    }
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

  let body: React.ReactNode = null;
  const NOTE = "px-3 py-2 text-sm text-[var(--osio-fg-subtle)]";
  if (mode === "error" || error) {
    body = <p role="alert" className={NOTE}>{error}</p>;
  } else if (unsupported) {
    body = <p className={NOTE}>This diagram kind is not available yet</p>;
  } else if (source) {
    body = <MermaidDiagram chart={source} />;
  }

  return (
    <div className="my-0 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      {editable ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5">
          <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
            <span>Kind</span>
            <select
              aria-label="Diagram kind"
              value={kind}
              onChange={(event) => onKindChange(event.target.value)}
              className={CONTROL}
            >
              <option value="mermaid">Mermaid</option>
              <option value="hierarchy">Page tree</option>
            </select>
          </label>
          {kind === "hierarchy" ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
                <span>Depth</span>
                <select
                  aria-label="Tree depth"
                  value={depth}
                  onChange={(event) => {
                    if (!rootPageId) return;
                    writeSpec(carry({ kind: "hierarchy", rootPageId, depth: Number(event.target.value) }));
                  }}
                  className={CONTROL}
                >
                  {DEPTHS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!pageId) return;
                  writeSpec(carry({ kind: "hierarchy", rootPageId: pageId, depth }));
                }}
                disabled={!pageId}
                className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                This page
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {title ? (
        <p className="px-3 pt-2 text-sm font-semibold text-[var(--osio-fg-default)]">{title}</p>
      ) : null}
      {editable && kind === "mermaid" ? (
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
      {truncated ? (
        <p className="px-3 pb-2 text-xs text-[var(--osio-fg-subtle)]">
          Showing the first {MAX_NODES} nodes
        </p>
      ) : null}
    </div>
  );
};
