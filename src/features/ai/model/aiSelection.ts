/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiSelection.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the user picked: a connection and a model, remembered on this device.
 *
 * The choice lives in `localStorage` under ONE key, so the Assistant composer
 * and the inline "Ask AI" panel always speak with the same voice. It is a
 * preference, not a secret: the API key itself never reaches the browser.
 *
 * The stored choice can go stale — the connection was removed, the provider
 * renamed a model. {@link resolveAiSelection} is the one place that answers
 * "what do we actually use?", and it never fails: an unknown connection falls
 * back to the platform one, an unknown model to its connection's default.
 */

/** Where the choice is remembered. */
export const AI_SELECTION_STORAGE_KEY = "osionos.ai.selection.v1";

/** The connection that always exists: our key, our daily budget. */
export const PLATFORM_CONNECTION_ID = "platform";

/** A connection and a model — what every run is sent with. */
export interface AiSelection {
  connectionId: string;
  model: string;
}

/** The part of a connection the fallback needs. */
export interface AiConnectionLike {
  id: string;
}

/** The part of a model the fallback needs. */
export interface AiModelLike {
  id: string;
  default?: boolean;
}

/** The slice of `Storage` this module uses — a test can pass its own. */
export interface SelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's storage, or null when there is none (a server render, a test). */
function browserStorage(): SelectionStorage | null {
  try {
    return (globalThis as { localStorage?: SelectionStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored choice, or null when there is none (or it is unreadable). */
export function readAiSelection(storage: SelectionStorage | null = browserStorage()): AiSelection | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AI_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AiSelection> | null;
    const connectionId = typeof parsed?.connectionId === "string" ? parsed.connectionId.trim() : "";
    if (!connectionId) return null;
    const model = typeof parsed?.model === "string" ? parsed.model.trim() : "";
    return { connectionId, model };
  } catch {
    return null;
  }
}

/** Remembers the choice. A storage that refuses (quota, private mode) is ignored. */
export function writeAiSelection(
  selection: AiSelection,
  storage: SelectionStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AI_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // A refused write is not a failure: the choice still holds for this session.
  }
}

/** The default model of a list — the one the service marks as such. */
export function defaultModelId(models: AiModelLike[]): string {
  return models.find((model) => model.default)?.id ?? models[0]?.id ?? "";
}

/**
 * The choice that is actually usable right now.
 *
 * - A stored connection that is gone → the platform connection and ITS
 *   default model.
 * - A stored model that the connection does not offer → that connection's
 *   default model.
 * - Nothing stored → the platform connection and its default model.
 *
 * It never throws and never returns a choice that does not exist.
 */
export function resolveAiSelection(
  stored: AiSelection | null,
  connections: AiConnectionLike[],
  modelsByConnection: Record<string, AiModelLike[]>,
): AiSelection {
  const platform = connections.find((connection) => connection.id === PLATFORM_CONNECTION_ID);
  const wanted = stored
    ? connections.find((connection) => connection.id === stored.connectionId)
    : undefined;
  const connection = wanted ?? platform;
  if (!connection) return { connectionId: PLATFORM_CONNECTION_ID, model: "" };

  const models = modelsByConnection[connection.id] ?? [];
  const wantedModel = wanted && stored ? stored.model : "";
  const model = models.some((entry) => entry.id === wantedModel) ? wantedModel : defaultModelId(models);
  return { connectionId: connection.id, model };
}
