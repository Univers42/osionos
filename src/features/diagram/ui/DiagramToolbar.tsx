/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DiagramToolbar.tsx                                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The controls of the diagram block: the kind, and what that kind needs.
 *
 * The kind is a choice of FOUR: a hand-written mermaid, a page tree, the
 * schema of the databases the viewer holds, the pipeline of one of them. The
 * `graph` kind is not offered — it needs a server read, and it is the next
 * slice.
 *
 * The controls of the two database kinds live behind a LAZY boundary: they
 * read the database store, and a mermaid diagram must never pay for that
 * chunk. The toolbar only decides WHICH controls to show.
 */

import React, { Suspense, lazy } from "react";

import type { DiagramKind, DiagramSpec } from "../model/diagramSpec";
import { CONTROL } from "./diagramControls";

/** The controls of the database kinds: they read the database store. */
const LazyDatabaseControls = lazy(() =>
  import("./DatabaseControls").then((module) => ({ default: module.DatabaseControls })),
);

const DEPTHS = [1, 2, 3, 4];

interface DiagramToolbarProps {
  /** The kind the editor shows. */
  kind: DiagramKind;
  /** The stored spec, when it parses. */
  parsed: DiagramSpec | null;
  /** The page the block is on: the root of a "this page" page tree. */
  pageId?: string;
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
  onKindChange,
  onWrite,
}) => {
  const treeSpec = parsed?.kind === "hierarchy" ? parsed : null;
  const depth = treeSpec?.depth ?? 2;
  const rootPageId = treeSpec?.rootPageId ?? pageId;
  const isDatabase = kind === "schema" || kind === "pipeline";
  const databaseSpec = isDatabase && parsed?.kind === kind ? parsed : null;

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
    </div>
  );
};
