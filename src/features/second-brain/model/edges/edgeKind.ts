/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   edgeKind.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EdgeKind } from "../graphModel";

/**
 * Map a BaaS edge `type` string to our internal `EdgeKind`. Covers the explicit
 * edges-mount types plus the server-side generator types documented in the
 * graph contract (`note_link`, `tagged`, and `<field-name>` references). Unknown
 * types — including reference edges named after a field — fall through to
 * `relation`, our default structural edge.
 */
export function edgeKindFromType(type: string | undefined): EdgeKind {
  if (!type) return "relation";
  const lowered = type.toLowerCase();
  if (lowered === "parent" || lowered === "parent_of" || lowered === "child_of" || lowered.includes("hierarchy")) return "hierarchy";
  if (lowered.includes("note_link") || lowered === "links_to") return "note_link";
  if (lowered.includes("note_of") || lowered === "annotates") return "note_of";
  if (lowered === "tagged" || lowered === "tag" || lowered.includes("tag")) return "tag";
  return "relation";
}
