/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileMeta.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Page ⇄ `.omd` front-matter: the single place where PageEntry field names meet
 * the on-disk meta key names. `metaFromPage` writes the mapping below, so the
 * same validators run on both sides and a value survives its own round trip:
 *
 *   _id → id          title → title        icon → icon          cover → cover
 *   coverPosition → cover_position        surface → surface    visibility → visibility
 *   databaseId → database_id              isTemplate → template
 *   isDefaultTemplate → template_default  templateSurface → template_surface
 *   recurrence → recurrence               properties → properties
 *   updatedAt → updated
 *
 * `surface: "page"` is the default and is not written; no key is ever written
 * as null. The read side is the trust boundary a hand-edited file crosses:
 * every value is validated and an invalid one is dropped, never coerced.
 */

import type {
  PageEntry,
  PagePropertyEntry,
  PagePropertyType,
  PageRecurrence,
  PageRecurrenceEvery,
  PageVisibility,
} from "@/entities/page";

import type { PageFileMeta } from "./types";

const SURFACES = [
  "page", "agent", "home", "folder", "wiki", "app", "code",
] as const satisfies readonly NonNullable<PageEntry["surface"]>[];
const VISIBILITIES = [
  "private", "shared", "public",
] as const satisfies readonly PageVisibility[];
const TEMPLATE_SURFACES = [
  "profile", "marketplace-app",
] as const satisfies readonly NonNullable<PageEntry["templateSurface"]>[];
const PROPERTY_TYPES = [
  "text", "date", "select", "url", "number", "checkbox", "relation",
  "email", "phone", "person", "multi_select", "status",
] as const satisfies readonly PagePropertyType[];
const RELATION_TARGETS = [
  "page", "database", "block", "mixed",
] as const satisfies readonly NonNullable<PagePropertyEntry["relationTarget"]>[];
const RECURRENCE_EVERY = [
  "none", "day", "week", "month",
] as const satisfies readonly PageRecurrenceEvery[];

// Ponytail: a legitimate title or icon longer than 4096 chars is dropped (false
// negative); the cap keeps one front-matter line bounded and diffable.
const TEXT_CAP = 4096;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= TEXT_CAP ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function percent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== "string") return undefined;
  return allowed.find((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stamp(value: unknown): string | null | undefined {
  return value === null ? null : text(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

/** Copy one optional field, omitting undefined so the file never carries `key: null`. */
function put<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) return;
  target[key] = value;
}

function recurrence(value: unknown): PageRecurrence | undefined {
  if (!isRecord(value)) return undefined;
  const every = oneOf(value.every, RECURRENCE_EVERY);
  if (every === undefined) return undefined;
  const out: PageRecurrence = { every };
  put(out, "nextDueAt", stamp(value.nextDueAt));
  put(out, "lastRunAt", stamp(value.lastRunAt));
  return out;
}

function properties(value: unknown): PagePropertyEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  // Ponytail: one malformed entry is dropped, so a file with 50 properties and
  // one bad value keeps 49 — the kept ones are never guessed at from the bad.
  const out = value.flatMap((item) => {
    const entry = property(item);
    return entry === undefined ? [] : [entry];
  });
  return out.length > 0 ? out : undefined;
}

function property(value: unknown): PagePropertyEntry | undefined {
  if (!isRecord(value)) return undefined;
  const key = text(value.key);
  const label = text(value.label);
  if (key === undefined || label === undefined) return undefined;
  // Ponytail: an absent or ill-typed value reads as null (the type requires the
  // field), so a hand-written `"value": {}` keeps its key and label but loses the value.
  const entry: PagePropertyEntry = { key, label, value: propertyValue(value.value) ?? null };
  put(entry, "type", oneOf(value.type, PROPERTY_TYPES));
  put(entry, "options", isStringArray(value.options) ? value.options : undefined);
  put(entry, "relationTarget", oneOf(value.relationTarget, RELATION_TARGETS));
  return entry;
}

function propertyValue(value: unknown): PagePropertyEntry["value"] | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return isStringArray(value) ? value : undefined;
}

/**
 * The front-matter a page is stored as. O(1) fields read, O(p) when a recurrence
 * or a property list is copied — one pass, no lookups by key.
 */
export function metaFromPage(page: PageEntry): PageFileMeta {
  const meta: PageFileMeta = {};
  put(meta, "id", text(page._id));
  put(meta, "title", text(page.title));
  put(meta, "icon", text(page.icon));
  put(meta, "cover", text(page.cover));
  put(meta, "cover_position", percent(page.coverPosition));
  put(meta, "surface", page.surface === "page" ? undefined : oneOf(page.surface, SURFACES));
  put(meta, "visibility", oneOf(page.visibility, VISIBILITIES));
  put(meta, "database_id", text(page.databaseId));
  put(meta, "template", bool(page.isTemplate));
  put(meta, "template_default", bool(page.isDefaultTemplate));
  put(meta, "template_surface", oneOf(page.templateSurface, TEMPLATE_SURFACES));
  put(meta, "recurrence", recurrence(page.recurrence));
  put(meta, "properties", properties(page.properties));
  put(meta, "updated", text(page.updatedAt));
  return meta;
}

/**
 * The inverse of `metaFromPage`, minus `id` and `updated` — the caller uses
 * those for identity and tie-breaks, so a file never re-assigns them. Unknown
 * keys are ignored and an out-of-range or wrongly-typed value is dropped.
 * O(1) fields plus O(p) for the property list.
 */
export function patchFromMeta(meta: Record<string, unknown>): Partial<PageEntry> {
  const patch: Partial<PageEntry> = {};
  put(patch, "title", text(meta.title));
  put(patch, "icon", text(meta.icon));
  put(patch, "cover", text(meta.cover));
  put(patch, "coverPosition", percent(meta.cover_position));
  put(patch, "surface", oneOf(meta.surface, SURFACES));
  put(patch, "visibility", oneOf(meta.visibility, VISIBILITIES));
  put(patch, "databaseId", text(meta.database_id));
  put(patch, "isTemplate", bool(meta.template));
  put(patch, "isDefaultTemplate", bool(meta.template_default));
  put(patch, "templateSurface", oneOf(meta.template_surface, TEMPLATE_SURFACES));
  put(patch, "recurrence", recurrence(meta.recurrence));
  put(patch, "properties", properties(meta.properties));
  return patch;
}
