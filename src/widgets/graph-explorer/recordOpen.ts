/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordOpen.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { registerRecordTemplates } from "@/entities/page/model/recordTemplates";
import { parseNodeId } from "@/features/second-brain/baas/buildRecordTxn";
import { api, getActivePageJwt } from "@/shared/api/client";

// Register the commerce/ops record templates the moment the record-open path is
// imported (idempotent), so a freshly opened record note resolves its template.
registerRecordTemplates();

/** Note/tag/synthetic ids that are NOT engine records (the note branch owns these). */
const NON_RECORD_MOUNTS = new Set(["osionos"]);

/**
 * A graph NodeId is a RECORD when it is `<dbId>:<resource>:<pk>` AND not a note,
 * tag, folder or local id. Note nodes are `osionos:osionos_pages:<id>` / `note:` /
 * `tag:`; their mount is `osionos`. Everything else (`<dbId>:orders:1234`, …) is a
 * record in an engine mount. We require all three parts so a malformed id is skipped.
 */
export function isRecordNodeId(nodeId: string): boolean {
  if (nodeId.startsWith("note:") || nodeId.startsWith("tag:")) return false;
  const ref = parseNodeId(nodeId);
  if (!ref.mount || !ref.resource || !ref.pk) return false;
  return !NON_RECORD_MOUNTS.has(ref.mount);
}

/**
 * Resolve-or-create the osionos note backing a record and return its page entry —
 * the bridge upserts a deterministic note (idempotent) and projects the row's
 * columns into page properties. Returns null on any failure (the caller no-ops).
 */
export async function openRecordNode(nodeId: string): Promise<PageEntry | null> {
  const ref = parseNodeId(nodeId);
  const path = `/api/records/${encodeURIComponent(ref.mount)}/${encodeURIComponent(ref.resource)}/${encodeURIComponent(ref.pk)}/open`;
  try {
    return await api.post<PageEntry>(path, {}, getActivePageJwt() ?? undefined);
  } catch {
    return null;
  }
}
