/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramRenderMode.ts                                  +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a diagram block DOES: draw it, hold a placeholder, or say it is broken.
 *
 * The decision is a PURE function of two things — is this a public page, and
 * does the stored spec parse — so it can be tested without a browser and
 * without a store.
 *
 * C110 (devil): on a PUBLIC page the block draws NOTHING and reads no other
 * page. A published page is a snapshot: the tree of a shared workspace is not
 * part of it, and a visitor may not read those pages at all. So the public
 * page gets a placeholder — the word "Diagram" and the title — and the spec is
 * not even parsed there.
 */

import { parseDiagramSpec } from "./diagramSpec";

/** What the block does with its spec. */
export type DiagramRenderMode =
  /** Draw the diagram. */
  | "render"
  /** A public page: a text placeholder, no diagram, no other page read. */
  | "placeholder"
  /** The stored spec does not parse: say so, draw nothing. */
  | "error";

/**
 * The mode of a diagram block.
 *
 * The public page wins over everything: a published page never draws a
 * diagram, not even a hand-written one, and never says that a spec is broken
 * (that would leak that the page held one).
 */
export function diagramRenderMode({
  isPublic,
  spec,
}: {
  isPublic: boolean;
  spec: unknown;
}): DiagramRenderMode {
  if (isPublic) return "placeholder";
  return parseDiagramSpec(spec).ok ? "render" : "error";
}
