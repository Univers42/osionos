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
 * The client of the memory routes of the AI service: list, approve, reject,
 * archive and edit. The transport is the one of every AI route; the answer is
 * checked by the pure parser of the model before anything reads it.
 */

import { AiError } from "./aiContract";
import { requestJson } from "./aiClient";
import { parseMemories, parseMemory, type AiMemory } from "@/features/ai/model/memories";

const malformed = (): AiError => new AiError(502, "bad_answer", "The AI service answered something unexpected.");
const memoryPath = (id: string): string => `/memories/${encodeURIComponent(id)}`;

/** `GET /workspaces/:id/memories` — the caller's proposed and approved memories. */
export async function listMemories(workspaceId: string): Promise<AiMemory[]> {
  const body = await requestJson<{ memories?: unknown }>("GET", `/workspaces/${encodeURIComponent(workspaceId)}/memories`);
  return parseMemories(body.memories);
}

async function change(method: "POST" | "PATCH", path: string, body?: unknown): Promise<AiMemory> {
  // The service answers the bare memory, not an envelope.
  const memory = parseMemory(await requestJson<unknown>(method, path, body ?? {}));
  if (!memory) throw malformed();
  return memory;
}

export const approveMemory = (id: string): Promise<AiMemory> => change("POST", `${memoryPath(id)}/approve`);
export const rejectMemory = (id: string): Promise<AiMemory> => change("POST", `${memoryPath(id)}/reject`);
export const archiveMemory = (id: string): Promise<AiMemory> => change("POST", `${memoryPath(id)}/archive`);
export const editMemory = (id: string, body: string): Promise<AiMemory> => change("PATCH", memoryPath(id), { body });
