/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Second Brain — public surface.
 *
 * Phase 0 ships the pure model layer (doc 01): a deterministic, incremental
 * projection of the canonical state into a typed graph, with index-backed
 * selectors. The layout worker, Canvas renderer, transaction client, and UI
 * (docs 02/04/05/06) build on these types without touching the projection.
 */

export type {
  EdgeId,
  EdgeKind,
  GraphEdge,
  GraphModel,
  GraphNode,
  GraphPatch,
  NodeId,
  NodeKind,
} from "./model/graphModel";
export {
  emptyModel,
  indexModel,
  makeEdgeId,
  makeNoteNodeId,
  makeRecordNodeId,
  makeTagNodeId,
  nodesEqual,
} from "./model/graphModel";

export { type DeriveOptions, deriveGraph } from "./model/deriveGraph";
export { deriveTagConfig } from "./model/deriveTagConfig";
export { diffGraph, isEmptyPatch } from "./model/diffGraph";

export { type ExplicitEdgeRecord } from "./model/edges/explicitEdges";
export { type TagConfig } from "./model/edges/tagEdges";

export {
  type FocusState,
  type Neighborhood,
  type SearchIndex,
  buildSearchIndex,
  filterByDatabase,
  focusDimming,
  neighborhood,
  topByWeight,
} from "./model/selectors";

export { NOTE_COLOR, TAG_COLOR, databaseColor } from "./model/palette";

export { GRAPH_SOURCE, SECOND_BRAIN_V2 } from "./featureFlag";
export { SecondBrainView } from "./ui/SecondBrainView";
export { useNoteGraphSync } from "./sync/useNoteGraphSync";
export { publishNote, unpublishNote, noteRowId } from "./baas/publishNote";

export type { BaasGenerators, BaasGraphResponse, BaasResource, GraphGuarantee } from "./baas/types";
export { type MappedGraph, mapGraphResponse } from "./baas/mapGraphResponse";
export { accumulateGraph } from "./baas/accumulateGraph";
export { configuredResources, edgesMount, edgesTable, fetchGraphFocus, fetchGraphOverview, isBaasGraphEnabled, overlayTable } from "./baas/baasGraphClient";
export { type GroupCount, aggregateCount, aggregateGroupCount, countFromRows, groupCountsFromRows } from "./baas/baasAggregate";

export type { TxnOperation, TxnRequest, TxnResult } from "./baas/txnTypes";
export { commitTxn, isTxnEnabled, txnApplied } from "./baas/baasTxnClient";
export { BaasError } from "./baas/baasFetch";
export { type RecordRef, buildRecordUpdate, parseNodeId } from "./baas/buildRecordTxn";
export { type DemoteParams, type PromoteParams, buildDemoteTxn, buildPromoteTxn, overlayNodeId } from "./baas/buildNoteTxn";
export { patchNodeFields } from "./baas/patchNode";
export { type PromoteEcho, applyDemote, applyPromote } from "./baas/notePatch";
