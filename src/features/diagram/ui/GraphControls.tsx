/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GraphControls.tsx                                   +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The controls of the graph kind: how deep the neighbourhood goes, and which
 * kinds of edge it holds.
 *
 * The kinds are the ones the GRAPH holds — the toggles never offer a kind the
 * reader's graph does not have, so the list answers the question "what can I
 * draw here?" and nothing else.
 *
 * They live behind the lazy boundary of the bridge, like the controls of the
 * database kinds: the graph is read once, and the toolbar of a mermaid
 * diagram never pays for that chunk.
 */

import React from "react";

import type { DiagramSpec, GraphKind } from "../model/diagramSpec";
import { CONTROL } from "./diagramControls";

/** The label of each kind of edge. */
const KIND_LABELS: Record<GraphKind, string> = {
  link: "Links",
  mention: "Mentions",
  relation: "Relations",
  parent: "Parents",
  tag: "Tags",
  semantic: "Semantic",
};

/** The depths a neighbourhood may go: one hop, or two. */
const DEPTHS = [1, 2];

interface GraphControlsProps {
  /** The stored spec, when it is one of that kind. */
  spec: DiagramSpec | null;
  /** The page the block is on: the default centre of the neighbourhood. */
  pageId?: string;
  /** The kinds of edge the graph holds — the toggles. */
  kinds: GraphKind[];
  /** Write a new spec of that kind. */
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * The controls of the graph kind.
 *
 * Every control is labelled and reachable with the keyboard: the depth is a
 * select, the kinds are checkboxes in a fieldset.
 */
export const GraphControls: React.FC<GraphControlsProps> = ({
  spec,
  pageId,
  kinds,
  onChange,
}) => {
  const graphSpec = spec?.kind === "graph" ? spec : null;
  const centerId = graphSpec?.pageId ?? pageId ?? "";
  const depth = graphSpec?.depth ?? 1;
  // An empty list means EVERY kind: the spec that names no filter names no
  // exclusion, and the toggles show them all as on.
  const chosen = graphSpec?.kinds.length ? graphSpec.kinds : kinds;
  const checked = new Set(chosen);

  const toggle = (kind: GraphKind, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(kind);
    else next.delete(kind);
    onChange({
      kind: "graph",
      pageId: centerId,
      depth,
      kinds: kinds.filter((candidate) => next.has(candidate)),
    });
  };

  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
        <span>Depth</span>
        <select
          aria-label="Graph depth"
          value={depth}
          onChange={(event) =>
            onChange({
              kind: "graph",
              pageId: centerId,
              depth: Number(event.target.value),
              kinds: graphSpec?.kinds ?? [],
            })
          }
          className={CONTROL}
        >
          {DEPTHS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {kinds.length > 0 ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-xs text-[var(--osio-fg-muted)]">Links</legend>
          {kinds.map((kind) => (
            <label
              key={kind}
              className="flex items-center gap-1 text-xs text-[var(--osio-fg-default)]"
            >
              <input
                type="checkbox"
                checked={checked.has(kind)}
                // The last kind stays on: an empty list means EVERY kind, so
                // a list of none would draw everything and say otherwise.
                disabled={checked.size === 1 && checked.has(kind)}
                onChange={(event) => toggle(kind, event.target.checked)}
              />
              {KIND_LABELS[kind]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!pageId) return;
          onChange({
            kind: "graph",
            pageId,
            depth,
            kinds: graphSpec?.kinds ?? [],
          });
        }}
        disabled={!pageId}
        className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        This page
      </button>
    </>
  );
};
