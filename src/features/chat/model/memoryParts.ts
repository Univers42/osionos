/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memoryParts.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Remember this?" chip of a message: a memory the assistant proposed.
 *
 * The frame `memory.proposed` carries the id and the text of the proposal; the
 * client keeps them on the message as a part. The part only SHOWS the
 * proposal: nothing is remembered until the user presses Approve (devil C42).
 *
 * Pure logic, no React: the chip lives in ui/MemoryProposalChip.tsx.
 *
 * Caveat: MEMORY_PROPOSAL_MAX is copied from the service (MAX_BODY); a longer
 * body is dropped, so the chip does not show but the memory still waits in
 * Settings › AI memory.
 */

import { MEMORY_BODY_MAX } from "@/features/ai/model/memories";
import type { ChatMessagePart } from "./chatTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MemoryDecision = "approved" | "rejected";

export interface MemoryProposalPart {
  type: "memory-proposal";
  memoryId: string;
  body: string;
  decision?: MemoryDecision;
}

/** The chip of a `memory.proposed` frame; null when the frame is not a proposal. */
export function memoryProposalFromEvent(data: Record<string, unknown>): MemoryProposalPart | null {
  const { id, body } = data;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof body !== "string" || body.length === 0 || body.length > MEMORY_BODY_MAX) return null;
  return { type: "memory-proposal", memoryId: id, body };
}

/** The parts with the proposal added; the same proposal is never twice. */
export function withMemoryProposal(parts: ChatMessagePart[], proposal: MemoryProposalPart): ChatMessagePart[] {
  const known = parts.some((part) => part.type === "memory-proposal" && part.memoryId === proposal.memoryId);
  return known ? parts : [...parts, proposal];
}

/** The proposals of a message, in the order they were made. */
export function memoryProposalsFromParts(parts: ChatMessagePart[] | undefined): MemoryProposalPart[] {
  return (parts ?? []).filter((part): part is MemoryProposalPart => part.type === "memory-proposal");
}

/** New parts where only the matching proposal carries the decision. */
export function withMemoryDecision(
  parts: ChatMessagePart[],
  memoryId: string,
  decision: MemoryDecision,
): ChatMessagePart[] {
  return parts.map((part) =>
    part.type === "memory-proposal" && part.memoryId === memoryId ? { ...part, decision } : part,
  );
}
