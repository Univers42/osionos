/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DiagramToolbar.tsx                                   +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The controls of the diagram block: the kind, what that kind needs, and the
 * export of what was drawn.
 *
 * The kind is a choice of FIVE: a hand-written mermaid, a page tree, the
 * schema of the databases the viewer holds, the pipeline of one of them, and
 * the links around a page.
 *
 * The controls of the database kinds and of the graph kind live behind a LAZY
 * boundary: they read the database store and the bridge, and a mermaid diagram
 * must never pay for those chunks. The toolbar only decides WHICH controls to
 * show.
 *
 * The export is the LAST door: the compiled text goes to the clipboard, and
 * the SVG the locked renderer already drew goes to the disk. Nothing is
 * rendered again, and a published page never exports.
 */

import React, { Suspense, lazy } from "react";

import {
  canExportDiagram,
  copyMermaidText,
  diagramFileName,
  downloadDiagramSvg,
} from "../model/diagramExport";
import type { DiagramKind, DiagramSpec, GraphKind } from "../model/diagramSpec";
import { CONTROL } from "./diagramControls";

/** The controls of the database kinds: they read the database store. */
const LazyDatabaseControls = lazy(() =>
  import("./DatabaseControls").then((module) => ({ default: module.DatabaseControls })),
);

/** The controls of the graph kind: they read the bridge. */
const LazyGraphControls = lazy(() =>
  import("./GraphControls").then((module) => ({ default: module.GraphControls })),
);

const DEPTHS = [1, 2, 3, 4];

interface DiagramToolbarProps {
  /** The kind the editor shows. */
  kind: DiagramKind;
  /** The stored spec, when it parses. */
  parsed: DiagramSpec | null;
  /** The page the block is on: the root of a "this page" page tree. */
  pageId?: string;
  /** True when this document is a published page: it never exports. */
  isPublic: boolean;
  /** The compiled text of the diagram, for the copy. */
  source: string | null;
  /** The SVG the locked renderer drew, for the download. */
  getSvg: () => SVGElement | null;
  /** The kinds of edge the graph holds — the toggles. */
  kinds: GraphKind[];
  /** Write a new spec of another kind. */
  onKindChange: (kind: string) => void;
  /** Write a new spec of the kind the toolbar shows. */
  onWrite: (next: Record<string, unknown>) => void;
}

/**
 * The toolbar of the diagram block.
 *
 * Every control is labelled and reachable with the keyboard: the kind is a
 * select, the depth is a select, and the databases are checkboxes in a
 * fieldset.
 */
export const DiagramToolbar: React.FC<DiagramToolbarProps> = ({
  kind,
  parsed,
  pageId,
  isPublic,
  source,
  getSvg,
  kinds,
  onKindChange,
  onWrite,
}) => {
  const treeSpec = parsed?.kind === "hierarchy" ? parsed : null;
  const depth = treeSpec?.depth ?? 2;
  const rootPageId = treeSpec?.rootPageId ?? pageId;
  const isDatabase = kind === "schema" || kind === "pipeline";
  const databaseSpec = isDatabase && parsed?.kind === kind ? parsed : null;
  const graphSpec = kind === "graph" && parsed?.kind === "graph" ? parsed : null;
  const title = parsed?.title;

  return (
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
          <option value="schema">Database schema</option>
          <option value="pipeline">Pipeline</option>
          <option value="graph">Links</option>
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
                onWrite({
                  kind: "hierarchy",
                  rootPageId,
                  depth: Number(event.target.value),
                });
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
              onWrite({ kind: "hierarchy", rootPageId: pageId, depth });
            }}
            disabled={!pageId}
            className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            This page
          </button>
        </>
      ) : null}
      {isDatabase ? (
        <Suspense fallback={null}>
          <LazyDatabaseControls
            key={kind}
            kind={kind}
            spec={databaseSpec}
            onChange={onWrite}
          />
        </Suspense>
      ) : null}
      {kind === "graph" ? (
        <Suspense fallback={null}>
          <LazyGraphControls
            spec={graphSpec}
            pageId={pageId}
            kinds={kinds}
            onChange={onWrite}
          />
        </Suspense>
      ) : null}
      {canExportDiagram({ isPublic }) ? (
        <>
          <button
            type="button"
            onClick={() => void copyMermaidText({ isPublic, source })}
            disabled={!source}
            className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Copy Mermaid
          </button>
          <button
            type="button"
            onClick={() =>
              downloadDiagramSvg({
                isPublic,
                svg: getSvg(),
                fileName: diagramFileName(title),
              })
            }
            className={CONTROL}
          >
            Download SVG
          </button>
        </>
      ) : null}
    </div>
  );
};
