/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DiagramOutput.tsx                                    +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a diagram block DRAWS: the one locked renderer, the note that says the
 * diagram holds less than the data, and the text of a diagram that cannot be
 * drawn.
 *
 * The paths of the block — a hand-written mermaid, a page tree, the schema of
 * the client's databases — end in the SAME output, so they share it: there is
 * one way to draw a diagram here, and one way to say that there is none.
 */

import React from "react";

import { MermaidDiagram } from "@/shared/ui";

import { MAX_NODES } from "../model/diagramIR";

/** The text of a diagram that cannot be drawn. */
const NOTE = "px-3 py-2 text-sm text-[var(--osio-fg-subtle)]";

/** The note that says the diagram holds less than the data. */
const TRUNCATED = "px-3 pb-2 text-xs text-[var(--osio-fg-subtle)]";

/** What the block has to draw (or why it draws nothing). */
export interface DiagramOutputProps {
  /** The mermaid text the locked renderer draws; null when there is none. */
  source: string | null;
  /** True when the diagram holds less than the data (the caps dropped nodes). */
  truncated: boolean;
  /** Why there is no source; null when there is one. */
  error: string | null;
  /** True for a kind of the spec whose adapter does not exist yet. */
  unsupported?: boolean;
}

/**
 * The output of a diagram: the diagram, or the reason there is none.
 *
 * The error wins over everything: a broken spec says so and draws nothing. An
 * unsupported kind says the kind is not available yet. Otherwise the mermaid
 * text goes through the ONE locked renderer.
 */
export const DiagramOutput: React.FC<DiagramOutputProps> = ({
  source,
  truncated,
  error,
  unsupported,
}) => {
  if (error) {
    return (
      <p role="alert" className={NOTE}>
        {error}
      </p>
    );
  }
  if (unsupported) {
    return <p className={NOTE}>This diagram kind is not available yet</p>;
  }
  if (!source) return null;
  return (
    <>
      <MermaidDiagram chart={source} />
      {truncated ? <p className={TRUNCATED}>Showing the first {MAX_NODES} nodes</p> : null}
    </>
  );
};
