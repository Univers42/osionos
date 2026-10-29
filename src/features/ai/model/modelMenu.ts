/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   modelMenu.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/**
 * The model menu as data: what the picker shows, built from what the service
 * says — never from a list written in the app.
 *
 * The service's model record carries an id, a label, a default flag and a few
 * capability flags. It carries NO release date and NO provider, so the family
 * (Claude, Gemini…) and the age of a model are read from its id:
 *
 * - family: the `vendor/model` prefix when there is one, else the name stem
 *   (`claude-…`, `gemini-…`, `gpt-…`, `grok-…`); the rest are open models.
 * - older: the first number of the name is its generation ("gpt-4o" is 4,
 *   "claude-3-5-sonnet" is 3.5). A model is older when its generation is at
 *   least one whole generation behind the newest of its family on the list.
 * - recommended: the platform default first, then every starred model, then
 *   the newest model of each family in the fixed family order, at most four.
 *
 * Caveat: the generation is a regex over the id. An id with no small number
 * ("gpt-oss-120b", "mistral-large-latest") has no generation and is never
 * older; a vendor that renumbers (a "4" after a "20") reads wrong in the
 * direction of showing too many models as current — the safe one. Within one
 * generation the first model of the service's own order wins, which is
 * the service's guess at its flagship, not a measured ranking.
 */

import { PLATFORM_CONNECTION_ID, type AiSelection } from "./aiSelection";

/** The most models the Recommended section shows. */
export const MAX_RECOMMENDED = 4;

/** Where the pinned models are remembered, on this device. */
export const AI_STARRED_STORAGE_KEY = "osionos.ai.starred.v1";

const MAX_STARRED = 50;

export type ModelFamily = "claude" | "gemini" | "gpt" | "grok" | "open" | "other";

/** The order the groups are drawn in. */
export const FAMILY_ORDER: readonly ModelFamily[] = ["claude", "gemini", "gpt", "grok", "open", "other"];

export const FAMILY_HEADING: Record<ModelFamily, string> = {
  claude: "Claude",
  gemini: "Gemini",
  gpt: "GPT",
  grok: "Grok",
  open: "Open models",
  other: "Other",
};

/** The part of a model the menu needs. */
export interface MenuModel {
  id: string;
  label: string;
  default?: boolean;
  reasoning?: boolean;
}

/** A connection of the reader's own, with the models it offers. */
export interface MenuConnection {
  id: string;
  label: string;
  models: MenuModel[];
}

export interface ModelRow {
  connectionId: string;
  model: string;
  label: string;
  family: ModelFamily;
  reasoning: boolean;
  selected: boolean;
  starred: boolean;
}

export interface FamilyGroup {
  family: ModelFamily;
  heading: string;
  rows: ModelRow[];
}

export interface ModelMenuView {
  /** The platform connection with its own default model is the choice. */
  autoSelected: boolean;
  recommended: ModelRow[];
  /** Every platform model that is not older and not recommended, by family. */
  groups: FamilyGroup[];
  older: ModelRow[];
  /** The reader's own connections; the platform one is never here. */
  connections: Array<{ id: string; label: string; selected: boolean; models: ModelRow[] }>;
}

const OPEN_STEMS = /^(llama|mistral|mixtral|codestral|qwen|qwq|deepseek|gemma|phi|command|yi|glm|kimi|gpt-oss|nemotron|olmo|granite)/;
const VENDOR_FAMILY: Record<string, ModelFamily> = {
  anthropic: "claude",
  google: "gemini",
  openai: "gpt",
  "x-ai": "grok",
  xai: "grok",
};

function bareName(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1).toLowerCase();
}

/** The family of a model id. */
export function familyOf(id: string): ModelFamily {
  const name = bareName(id);
  if (OPEN_STEMS.test(name)) return "open";
  if (name.startsWith("claude")) return "claude";
  if (name.startsWith("gemini")) return "gemini";
  if (/^(gpt|chatgpt|o\d)/.test(name)) return "gpt";
  if (name.startsWith("grok")) return "grok";
  const vendor = id.includes("/") ? id.slice(0, id.indexOf("/")).toLowerCase() : "";
  if (VENDOR_FAMILY[vendor]) return VENDOR_FAMILY[vendor];
  return vendor ? "open" : "other";
}

/** "3.5" for "claude-3-5-sonnet", 4 for "gpt-4o", null when the name has no small number. */
export function generationOf(id: string): number | null {
  const found = /(?<!\d)(\d{1,2})(?!\d)(?:[.-](\d{1,2})(?!\d))?/.exec(bareName(id));
  if (!found) return null;
  return Number(found[1]) + (found[2] ? Number(found[2]) / 100 : 0);
}

// Open models are compared with their own line ("llama-" with "llama-"), not with
// every other open model: a Qwen 3 does not make a Llama 3.1 older.
function lineOf(id: string): string {
  const family = familyOf(id);
  return family === "open" || family === "other" ? `${family}:${bareName(id).split(/[\d]/)[0]}` : family;
}

/** The ids of the models that are a whole generation behind the newest of their line. */
export function olderIds(models: readonly MenuModel[]): Set<string> {
  const newest = new Map<string, number>();
  for (const model of models) {
    const generation = generationOf(model.id);
    if (generation === null) continue;
    const line = lineOf(model.id);
    newest.set(line, Math.max(newest.get(line) ?? 0, generation));
  }
  const older = new Set<string>();
  for (const model of models) {
    const generation = generationOf(model.id);
    const top = newest.get(lineOf(model.id));
    if (generation !== null && top !== undefined && Math.floor(top) - Math.floor(generation) >= 1) older.add(model.id);
  }
  return older;
}

/** Whether the choice is "Auto": the platform connection on its default model (or none yet). */
export function isAutoSelection(selection: AiSelection, platformModels: readonly MenuModel[]): boolean {
  if (selection.connectionId !== PLATFORM_CONNECTION_ID) return false;
  if (!selection.model || selection.model === "auto" || platformModels.length === 0) return true;
  return selection.model === (platformModels.find((model) => model.default) ?? platformModels[0]).id;
}

/** The short name on the pill: "Auto", or the label of the chosen model. */
export function pillLabel(selection: AiSelection, modelsByConnection: Record<string, readonly MenuModel[]>): string {
  if (isAutoSelection(selection, modelsByConnection[PLATFORM_CONNECTION_ID] ?? [])) return "Auto";
  const found = modelsByConnection[selection.connectionId]?.find((model) => model.id === selection.model);
  return found?.label || bareName(selection.model) || "Model";
}

/** The pinned ids a stored value holds; anything that is not a list of strings is none. */
export function parseStarred(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((id): id is string => typeof id === "string" && id !== ""))).slice(0, MAX_STARRED);
}

/** The list with `id` pinned, or unpinned when it was. */
export function toggleStarred(starred: readonly string[], id: string): string[] {
  return starred.includes(id) ? starred.filter((entry) => entry !== id) : [...starred, id].slice(-MAX_STARRED);
}

interface StarStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StarStorage | null {
  try {
    return (globalThis as { localStorage?: StarStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStarred(storage: StarStorage | null = browserStorage()): string[] {
  try {
    const raw = storage?.getItem(AI_STARRED_STORAGE_KEY);
    return raw ? parseStarred(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** A storage that refuses is ignored: the pins still hold for this session. */
export function writeStarred(starred: readonly string[], storage: StarStorage | null = browserStorage()): void {
  try {
    storage?.setItem(AI_STARRED_STORAGE_KEY, JSON.stringify(parseStarred([...starred])));
  } catch {
    // Not a failure: see above.
  }
}

interface MenuInput {
  selection: AiSelection;
  platformModels: readonly MenuModel[];
  connections: readonly MenuConnection[];
  starred: readonly string[];
}

/** What the menu shows for this choice, this model list and these pins. */
export function buildModelMenu({ selection, platformModels, connections, starred }: MenuInput): ModelMenuView {
  const autoSelected = isAutoSelection(selection, platformModels);
  const older = olderIds(platformModels);
  const defaultId = (platformModels.find((model) => model.default) ?? platformModels[0])?.id;
  const row = (connectionId: string, model: MenuModel): ModelRow => ({
    connectionId,
    model: model.id,
    label: model.label || model.id,
    family: familyOf(model.id),
    reasoning: model.reasoning === true,
    selected: selection.connectionId === connectionId && selection.model === model.id,
    starred: connectionId === PLATFORM_CONNECTION_ID && starred.includes(model.id),
  });
  const platformRows = platformModels.map((model) => row(PLATFORM_CONNECTION_ID, model));
  const byId = new Map(platformRows.map((entry) => [entry.model, entry]));

  const pickedIds: string[] = defaultId ? [defaultId] : [];
  for (const id of starred) if (byId.has(id)) pickedIds.push(id);
  // The newest of each family wins; on a tie the service's own order does.
  const generation = (entry: ModelRow) => generationOf(entry.model) ?? -1;
  for (const family of FAMILY_ORDER) {
    const newest = platformRows
      .filter((entry) => entry.family === family && !older.has(entry.model))
      .reduce<ModelRow | null>((top, entry) => (!top || generation(entry) > generation(top) ? entry : top), null);
    if (newest) pickedIds.push(newest.model);
  }
  const recommendedIds = Array.from(new Set(pickedIds)).slice(0, MAX_RECOMMENDED);
  const recommended = recommendedIds.map((id) => {
    const entry = byId.get(id) as ModelRow;
    // "Auto" and the default model are one choice: only "Auto" carries the check.
    return autoSelected && id === defaultId ? { ...entry, selected: false } : entry;
  });

  const rest = platformRows.filter((entry) => !recommendedIds.includes(entry.model) && !older.has(entry.model));
  const groups = FAMILY_ORDER.map((family) => ({
    family,
    heading: FAMILY_HEADING[family],
    rows: rest.filter((entry) => entry.family === family),
  })).filter((group) => group.rows.length > 0);

  return {
    autoSelected,
    recommended,
    groups,
    older: platformRows.filter((entry) => older.has(entry.model)),
    connections: connections
      .filter((connection) => connection.id !== PLATFORM_CONNECTION_ID)
      .map((connection) => ({
        id: connection.id,
        label: connection.label,
        selected: selection.connectionId === connection.id,
        models: connection.models.map((model) => row(connection.id, model)),
      })),
  };
}
