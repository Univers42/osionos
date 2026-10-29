/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   approvalParts.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of a write, on the message of the assistant.
 *
 * A run that wants to write does not write: it asks the user for the right to
 * write, and the service emits `permission.asked`. The client keeps the id of
 * that approval on the message of the assistant, as a part — the same way it
 * keeps the calls of the tools.
 *
 * The part is what the card is drawn FROM: the id is what the client asks the
 * service about, and the service rebuilds the card from the row of the
 * approval. Everything else in the part is what the client saw LIVE — the
 * verb, the pages the run had read, the moment the question closes itself. A
 * message that comes back from the server carries the id and the tool, and
 * nothing else: the rest is fetched again.
 *
 * Pure logic, no React: the card itself lives in ui/ApprovalCard.tsx.
 */

import type { ChatMessagePart } from "./chatTypes";

/** The card of a write, as the message of the assistant keeps it. */
export interface PermissionPart {
  type: "permission";
  /** The id of the approval: the card asks the service about it. */
  approvalId: string;
  /** The tool the model called. */
  tool: string;
  /** The verb of the card, when the client saw the request live. */
  verb?: string;
  /** The pages the run had read or quoted: where the request comes from. */
  provenancePageIds?: string[];
  /** When the question closes itself. */
  expiresAt?: string;
  /** What outside content shaped the request: `mcp:<label>` or `web:<domain>`. */
  influencedBy?: string[];
}

/**
 * The card of a write, out of a `permission.asked` frame.
 *
 * A frame without an id is not a card: it is dropped, and the reader sees
 * nothing about it.
 */
export function permissionFromEvent(data: Record<string, unknown>): PermissionPart | null {
  const approvalId = typeof data.approvalId === "string" ? data.approvalId : "";
  if (!approvalId) return null;
  const tool = typeof data.tool === "string" ? data.tool : "";
  const verb = typeof data.verb === "string" ? data.verb : "";
  const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
  const pageIds = pageIdsOf(data.provenance);
  const influencedBy = Array.isArray(data.influencedBy)
    ? data.influencedBy.filter((entry): entry is string => typeof entry === "string" && entry !== "")
    : [];
  return {
    type: "permission",
    approvalId,
    tool,
    ...(verb ? { verb } : {}),
    ...(pageIds.length > 0 ? { provenancePageIds: pageIds } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(influencedBy.length > 0 ? { influencedBy } : {}),
  };
}

/** The pages of the provenance of a frame: the ids, and only the ids. */
function pageIdsOf(provenance: unknown): string[] {
  const list = (provenance as { pageIds?: unknown } | null)?.pageIds;
  if (!Array.isArray(list)) return [];
  return list.filter((id): id is string => typeof id === "string");
}

/**
 * The parts of a message, with the card of a write in them.
 *
 * The same card is never twice: the frame of a run arrives once, and a
 * message that is reloaded carries the card already.
 */
export function withPermission(parts: ChatMessagePart[], permission: PermissionPart): ChatMessagePart[] {
  const known = parts.some(
    (part) => part.type === "permission" && part.approvalId === permission.approvalId,
  );
  if (known) return parts;
  return [...parts, permission];
}

/** The cards of the writes of a message, in the order they were asked. */
export function permissionsFromParts(parts: ChatMessagePart[] | undefined): PermissionPart[] {
  if (!parts) return [];
  const permissions: PermissionPart[] = [];
  for (const part of parts) {
    if (part.type !== "permission") continue;
    permissions.push(part);
  }
  return permissions;
}
