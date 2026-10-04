/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buildNoteTxn.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { TxnRequest } from "./txnTypes";

/**
 * Pure builders for the Phase 5 data↔note flow (baas-txn-endpoint.md §Phase 5).
 *
 * Promote = one atomic `/txn` (same mount): insert an overlay row (`{id,body,color}`)
 * + insert a `note_of` edge `overlay → record`. The overlay IS the note node
 * (its `data.body` is the text). Demote = delete both, atomically. The overlay
 * and edges tables must live in the same mount so promote/demote stay atomic.
 */

export interface PromoteParams {
  /** Mount holding the overlay + edges tables (the edges mount). */
  mount: string;
  overlayResource: string;
  edgesResource: string;
  /** Client-generated ids for the new overlay row and note_of edge row. */
  overlayId: string;
  edgeId: string;
  /** `<mount>:<resource>:<pk>` of the record being annotated. */
  sourceNodeId: string;
  body: string;
  color?: string;
}

/** The graph node id the new overlay row will surface as in `/graph`. */
export function overlayNodeId(mount: string, overlayResource: string, overlayId: string): string {
  return `${mount}:${overlayResource}:${overlayId}`;
}

export function buildPromoteTxn(params: PromoteParams): TxnRequest {
  const overlay = overlayNodeId(params.mount, params.overlayResource, params.overlayId);
  return {
    mount: params.mount,
    operations: [
      { op: "insert", resource: params.overlayResource, data: { id: params.overlayId, body: params.body, color: params.color ?? "violet" } },
      { op: "insert", resource: params.edgesResource, data: { id: params.edgeId, from: overlay, to: params.sourceNodeId, type: "note_of" } },
    ],
  };
}

export interface DemoteParams {
  mount: string;
  overlayResource: string;
  edgesResource: string;
  overlayId: string;
  edgeId: string;
}

export function buildDemoteTxn(params: DemoteParams): TxnRequest {
  return {
    mount: params.mount,
    operations: [
      { op: "delete", resource: params.edgesResource, filter: { id: params.edgeId } },
      { op: "delete", resource: params.overlayResource, filter: { id: params.overlayId } },
    ],
  };
}
