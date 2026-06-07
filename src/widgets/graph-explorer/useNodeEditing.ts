/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNodeEditing.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Inspector editing for the new graph view, reusing the Second Brain write path:
 * field edits go to the local store (local mode) or an atomic `/txn` batch (BaaS
 * mode) with optimistic apply + revert; note promote/demote runs the same atomic
 * batches. Extracted so the new view matches the legacy one's behavior exactly.
 */

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import type { NotionState } from "@notion-db/object-database";
import { GRAPH_SOURCE } from "@/features/second-brain/featureFlag";
import type { GraphModel, GraphNode, NodeId } from "@/features/second-brain/model/graphModel";
import { commitTxn, txnApplied } from "@/features/second-brain/baas/baasTxnClient";
import { buildRecordUpdate, parseNodeId } from "@/features/second-brain/baas/buildRecordTxn";
import { buildDemoteTxn, buildPromoteTxn, overlayNodeId } from "@/features/second-brain/baas/buildNoteTxn";
import { patchNodeFields } from "@/features/second-brain/baas/patchNode";
import { applyDemote, applyPromote } from "@/features/second-brain/baas/notePatch";
import { edgesMount, edgesTable, overlayTable } from "@/features/second-brain/baas/baasGraphClient";
import { BaasError } from "@/features/second-brain/baas/baasFetch";
import type { InspectorProperty } from "@/features/second-brain/ui/NodeInspector";

export interface NodeEditing {
  properties: InspectorProperty[];
  consistency: string | null;
  commitField: (key: string, value: string) => void;
  promoteToNote: () => void;
  demoteNote: () => void;
  notice: string | null;
}

export interface NodeEditingArgs {
  selectedNode: GraphNode | null;
  model: GraphModel;
  baasMode: boolean;
  setBaasModel: Dispatch<SetStateAction<GraphModel | null>>;
  state: NotionState;
  updatePageProperty: (recordId: string, propertyId: string, value: unknown) => void;
}

export function useNodeEditing(args: NodeEditingArgs): NodeEditing {
  const { selectedNode, model, baasMode, setBaasModel, state, updatePageProperty } = args;
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const properties = useMemo<InspectorProperty[]>(() => {
    if (!selectedNode) return [];
    if (baasMode) {
      return Object.entries(selectedNode.fields ?? {})
        .map(([key, value]) => ({ key, label: key, value: formatValue(value) }))
        .filter((property) => property.value.length > 0)
        .slice(0, 12);
    }
    return localRecordProperties(selectedNode.id, selectedNode.databaseId, state);
  }, [selectedNode, baasMode, state]);

  const commitField = (key: string, value: string): void => {
    if (!selectedNode) return;
    if (baasMode) {
      const node = selectedNode;
      const previous = node.fields?.[key];
      const revert = () => setBaasModel((prev) => (prev ? patchNodeFields(prev, node.id, { [key]: previous }) : prev));
      setBaasModel((prev) => (prev ? patchNodeFields(prev, node.id, { [key]: value }) : prev));
      commitTxn(buildRecordUpdate(node.id, { [key]: value }))
        .then((result) => { if (!txnApplied(result)) { revert(); setNotice("No change saved — you may not own this record."); } })
        .catch((error) => { revert(); setNotice(describeWriteError(error)); });
    } else {
      const prefix = `${GRAPH_SOURCE}:${selectedNode.databaseId}:`;
      const recordId = selectedNode.id.startsWith(prefix) ? selectedNode.id.slice(prefix.length) : selectedNode.id;
      updatePageProperty(recordId, key, value);
    }
  };

  const promoteToNote = (): void => {
    if (!baasMode || !selectedNode || selectedNode.kind === "note" || selectedNode.hasNote) return;
    const node = selectedNode;
    const mount = edgesMount();
    const overlayId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();
    const body = `Notes on ${node.label}`;
    const echo = { overlayNodeId: overlayNodeId(mount, overlayTable(), overlayId), body, sourceNodeId: node.id, edgeRecordId: edgeId };
    setBaasModel((prev) => (prev ? applyPromote(prev, echo) : prev));
    const request = buildPromoteTxn({ mount, overlayResource: overlayTable(), edgesResource: edgesTable(), overlayId, edgeId, sourceNodeId: node.id, body });
    const revert = () => setBaasModel((prev) => (prev ? applyDemote(prev, echo.overlayNodeId, node.id) : prev));
    commitTxn(request)
      .then((result) => { if (!txnApplied(result)) { revert(); setNotice("Couldn't create the note."); } })
      .catch((error) => { revert(); setNotice(describeWriteError(error)); });
  };

  const demoteNote = (): void => {
    if (!baasMode || !selectedNode) return;
    const node = selectedNode;
    const noteEdge = model.edges.find((edge) => edge.kind === "note_of" && edge.target === node.id);
    if (!noteEdge?.recordId) return;
    const overlay = noteEdge.source;
    const snapshot = model;
    setBaasModel((prev) => (prev ? applyDemote(prev, overlay, node.id) : prev));
    const request = buildDemoteTxn({ mount: edgesMount(), overlayResource: overlayTable(), edgesResource: edgesTable(), overlayId: parseNodeId(overlay).pk, edgeId: noteEdge.recordId });
    commitTxn(request)
      .then((result) => { if (!txnApplied(result)) { setBaasModel(snapshot); setNotice("Couldn't remove the note."); } })
      .catch((error) => { setBaasModel(snapshot); setNotice(describeWriteError(error)); });
  };

  return { properties, consistency: baasMode ? "atomic" : null, commitField, promoteToNote, demoteNote, notice };
}

function localRecordProperties(nodeId: NodeId, databaseId: string | null, state: NotionState): InspectorProperty[] {
  if (!databaseId) return [];
  const prefix = `${GRAPH_SOURCE}:${databaseId}:`;
  const recordId = nodeId.startsWith(prefix) ? nodeId.slice(prefix.length) : nodeId;
  const page = state.pages[recordId];
  const database = state.databases[databaseId];
  if (!page || !database) return [];
  return Object.values(database.properties)
    .filter((property) => property.id !== database.titlePropertyId)
    .slice(0, 10)
    .map((property) => ({ key: property.id, label: property.name, value: formatValue(page.properties[property.id]) }))
    .filter((entry) => entry.value.length > 0);
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function describeWriteError(error: unknown): string {
  if (error instanceof BaasError) {
    if (error.isConflict) return `Conflict — ${error.message}`;
    if (error.status === 403) return "Not allowed — you don't own this record.";
    return `Save failed (${error.status}).`;
  }
  return "Save failed — couldn't reach the BaaS.";
}
