/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memories.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The form of an AI memory: the contract of the service, checked before
 * anything reads it, and the words of its refusals.
 *
 * A memory is untrusted text (devil C39): this file only validates its shape;
 * the UI shows the body as a text node and nothing else.
 *
 * Caveat: MEMORY_BODY_MAX is copied from the service (MAX_BODY in
 * services/osionos-ai/src/memory/repo.ts); if it moves there and not here the
 * service still refuses and the panel shows its generic failure line.
 */

export const MEMORY_BODY_MAX = 300;

export type MemoryStatus = "proposed" | "approved" | "rejected" | "archived";
const STATUSES: readonly string[] = ["proposed", "approved", "rejected", "archived"];

export interface AiMemory {
  id: string;
  workspaceId: string;
  body: string;
  status: MemoryStatus;
  version: number;
  updatedAt: string;
}

/** One memory out of an answer; null when it does not match the contract. */
export function parseMemory(raw: unknown): AiMemory | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const { id, workspaceId, body, status, version, updatedAt } = item;
  if (typeof id !== "string" || id === "" || typeof workspaceId !== "string") return null;
  if (typeof body !== "string" || typeof updatedAt !== "string") return null;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (typeof version !== "number") return null;
  return { id, workspaceId, body, status: status as MemoryStatus, version, updatedAt };
}

/** The good memories of an answer; a malformed one is dropped, never thrown. */
export function parseMemories(raw: unknown): AiMemory[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => parseMemory(item) ?? []);
}

const newestFirst = (a: AiMemory, b: AiMemory): number => b.updatedAt.localeCompare(a.updatedAt);

/** The memories split by status, each newest first. */
export function groupMemories(list: readonly AiMemory[]): { proposed: AiMemory[]; approved: AiMemory[] } {
  return {
    proposed: list.filter((memory) => memory.status === "proposed").sort(newestFirst),
    approved: list.filter((memory) => memory.status === "approved").sort(newestFirst),
  };
}

const EMPTY_WORDS = "Write something to remember.";
const LONG_WORDS = `At most ${MEMORY_BODY_MAX} characters.`;

export type BodyCheck = { ok: true; body: string } | { ok: false; message: string };

/** The trimmed text, or the sentence that says what is wrong with it. */
export function validateMemoryBody(text: string): BodyCheck {
  const body = text.trim();
  if (body === "") return { ok: false, message: EMPTY_WORDS };
  if (body.length > MEMORY_BODY_MAX) return { ok: false, message: LONG_WORDS };
  return { ok: true, body };
}

/** The refusals of the service, in plain words. */
export function memoryErrorMessage(status: number | undefined, code: string | undefined): string {
  if (status === 404) return "This memory no longer exists.";
  if (status === 409 && code === "too_many_approved") {
    return "You already have 50 approved memories here. Archive one first.";
  }
  if (status === 409 && code === "wrong_state") return "This memory changed. Refresh the list.";
  if (status === 400 && code === "empty") return EMPTY_WORDS;
  if (status === 400 && code === "too_long") return LONG_WORDS;
  return "Could not save. Try again.";
}

/** The same words for a thrown value; anything that is not an AiError is generic. */
export function memoryFailureMessage(error: unknown): string {
  const { status, code } = (error ?? {}) as { status?: number; code?: string };
  return memoryErrorMessage(status, code);
}
