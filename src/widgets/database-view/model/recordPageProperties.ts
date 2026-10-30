/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordPageProperties.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One codec table for the engine row <-> osionos page property boundary.
 *
 * The engine stores option IDS, full ISO dates and computes formula/rollup
 * values on demand; the page editor renders LABELS, needs `YYYY-MM-DD` for its
 * date input, shows computed values as text and related rows by title. A value
 * the engine owns is projected read-only, so the page never offers an edit it
 * would drop. Projecting and editing go
 * through the same table, so projecting a row is write-free for any stored
 * shape, not only clean data.
 */

import type { PagePropertyEntry, PagePropertyType } from "@/entities/page";
import type {
  DatabaseSchema as EngineDatabaseSchema,
  Page as EnginePage,
  SelectOption,
} from "@notion-db/contract-types";

export type DatabaseSchema = EngineDatabaseSchema;
export type DatabasePage = EnginePage;
export type SchemaPropertyLike = DatabaseSchema["properties"][string];

export interface RecordValueResolver {
  /** Computed value of a formula property for this row. */
  formula(property: SchemaPropertyLike): unknown;
  /** Computed value of a rollup property for this row. */
  rollup(property: SchemaPropertyLike): unknown;
  /** Title of a related row, or null when the row is gone (the table drops it too). */
  title(rowId: string): string | null;
}

interface Codec {
  type: PagePropertyType;
  project(
    value: unknown,
    property: SchemaPropertyLike,
    page: DatabasePage,
    resolve: RecordValueResolver,
  ): PagePropertyEntry["value"];
  /** Read-only types omit this: edits made in the page are ignored. */
  edit?(
    value: PagePropertyEntry["value"],
    property: SchemaPropertyLike,
    current: unknown,
  ): { changed: boolean; value?: unknown };
}

const DAY_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const DEFAULT_TIME_SUFFIX = "T00:00:00.000Z";

/** Engine date -> the editor's `YYYY-MM-DD`, or null when there is no date. */
function toDay(value: unknown): string | null {
  if (typeof value === "string" && DAY_PREFIX.test(value)) return value.slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return null;
}

/** Option id -> label, built once per property so the lookup stays O(1). */
function labelsById(property: SchemaPropertyLike): Map<string, string> {
  return new Map((property.options ?? []).map((option) => [option.id, option.value]));
}

/** Label -> option, built once per property so the lookup stays O(1). */
function optionsByLabel(property: SchemaPropertyLike): Map<string, SelectOption> {
  return new Map((property.options ?? []).map((option) => [option.value, option]));
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

const textCodec: Codec = {
  type: "text",
  project: (value) => toSafeString(value),
  edit(value, _property, current) {
    const next = toSafeString(value);
    return { changed: toSafeString(current) !== next, value: next };
  },
};

const numberCodec: Codec = {
  type: "number",
  project: (value) => toNumber(value),
  edit(value, _property, current) {
    const next = value == null ? null : toNumber(value);
    const changed = next == null ? current != null : next !== toNumber(current);
    return { changed, value: next };
  },
};

const checkboxCodec: Codec = {
  type: "checkbox",
  project: (value) => Boolean(value),
  edit(value, _property, current) {
    const next = Boolean(value);
    return { changed: Boolean(current) !== next, value: next };
  },
};

function selectCodec(type: "select" | "status"): Codec {
  return {
    type,
    project(value, property) {
      if (value == null || value === "") return null;
      const raw = toSafeString(value);
      return labelsById(property).get(raw) ?? raw;
    },
    edit(value, property, current) {
      const label = toSafeString(value);
      if (!label) return { changed: current != null && current !== "", value: null };
      const option = optionsByLabel(property).get(label);
      // A label with no matching option would silently clear the cell: no edit.
      if (!option) return { changed: false };
      return { changed: current !== option.id, value: option.id };
    },
  };
}

const multiSelectCodec: Codec = {
  type: "multi_select",
  project(value, property) {
    const labels = labelsById(property);
    // Unknown ids stay visible as-is rather than disappearing from the page.
    return toStringArray(value).map((id) => labels.get(id) ?? id);
  },
  edit(value, property, current) {
    const idsByLabel = optionsByLabel(property);
    const currentIds = new Set(toStringArray(current));
    const next = toStringArray(value)
      .map((label) => idsByLabel.get(label)?.id ?? (currentIds.has(label) ? label : undefined))
      .filter((id): id is string => Boolean(id));
    return { changed: !sameStrings(next, toStringArray(current)), value: next };
  },
};

function dateCodec(editable: boolean): Codec {
  const codec: Codec = {
    type: "date",
    project: (value) => toDay(value),
  };
  if (!editable) return codec;
  codec.edit = (value, _property, current) => {
    const day = value == null ? "" : toSafeString(value).slice(0, 10);
    if (!day) return { changed: current != null, value: null };
    if (toDay(current) === day) return { changed: false };
    // Keep the time of the existing value: a date input only edits the day.
    const currentText = typeof current === "string" ? current : "";
    const timeStart = currentText.indexOf("T");
    const timeSuffix = timeStart >= 0 ? currentText.slice(timeStart) : DEFAULT_TIME_SUFFIX;
    return { changed: true, value: `${day}${timeSuffix}` };
  };
  return codec;
}

const urlCodec: Codec = { ...textCodec, type: "url" };
const emailCodec: Codec = { ...textCodec, type: "email" };
const phoneCodec: Codec = { ...textCodec, type: "phone" };

const placeCodec: Codec = {
  type: "text",
  project(value) {
    // A place value is `{address, lat?, lng?}` — show the address, not the raw
    // object (otherwise the opened record reads `{"address":"Reims"}`).
    if (value && typeof value === "object" && "address" in value) {
      const address = (value as { address?: unknown }).address;
      return typeof address === "string" ? address : "";
    }
    return typeof value === "string" ? value : "";
  },
};

const relationCodec: Codec = {
  type: "relation",
  project: (value, _property, _page, resolve) =>
    toStringArray(value).map((rowId) => resolve.title(rowId)).filter((title) => title !== null),
};

const formulaCodec: Codec = {
  type: "text",
  project: (_value, property, _page, resolve) => toSafeString(resolve.formula(property)),
};

const rollupCodec: Codec = {
  type: "text",
  project: (_value, property, _page, resolve) => toSafeString(resolve.rollup(property)),
};

/** Engine types with no dedicated codec keep the old generic text rendering. */
const fallbackCodec: Codec = {
  type: "text",
  project: (value) => toFallbackText(value),
};

/** Same projection, no edit: the engine owns the value. */
function readOnly(codec: Codec): Codec {
  return { type: codec.type, project: codec.project };
}

type PropertyTypeKey = SchemaPropertyLike["type"];

const CODECS: Readonly<Record<PropertyTypeKey, Codec>> = {
  title: readOnly(textCodec),
  text: textCodec,
  number: numberCodec,
  select: selectCodec("select"),
  multi_select: multiSelectCodec,
  status: selectCodec("status"),
  date: dateCodec(true),
  checkbox: checkboxCodec,
  person: readOnly(fallbackCodec),
  user: readOnly(fallbackCodec),
  url: urlCodec,
  email: emailCodec,
  phone: phoneCodec,
  files_media: readOnly(fallbackCodec),
  relation: relationCodec,
  formula: formulaCodec,
  rollup: rollupCodec,
  button: readOnly(fallbackCodec),
  place: placeCodec,
  id: readOnly(fallbackCodec),
  created_time: readOnly(dateCodec(false)),
  last_edited_time: readOnly(dateCodec(false)),
  created_by: readOnly(fallbackCodec),
  last_edited_by: readOnly(fallbackCodec),
  assigned_to: readOnly(fallbackCodec),
  due_date: dateCodec(true),
  custom: readOnly(fallbackCodec),
};

function codecFor(property: SchemaPropertyLike): Codec {
  return CODECS[property.type] ?? fallbackCodec;
}

/** Engine row -> the property entries the osionos page editor renders. */
export function projectRecordProperties(
  database: DatabaseSchema,
  page: DatabasePage,
  resolve: RecordValueResolver,
): PagePropertyEntry[] {
  // The title column is the page's own title, not a property row under it.
  return Object.values(database.properties).filter((property) => property.type !== "title").map((property) => {
    const codec = codecFor(property);
    return {
      key: property.id,
      label: property.name,
      type: codec.type,
      value: codec.project(page.properties[property.id], property, page, resolve),
      options: property.options?.map((option) => option.value),
      relationTarget: property.type === "relation" ? "database" : undefined,
      readOnly: !codec.edit,
    };
  });
}

const NO_RESOLVE: RecordValueResolver = {
  formula: () => undefined,
  rollup: () => undefined,
  title: () => null,
};

/** Page edits -> engine writes, using each property's CURRENT raw value. */
export function recordPropertyEdits(
  database: DatabaseSchema,
  page: DatabasePage,
  entries: readonly PagePropertyEntry[],
): Array<{ propertyId: string; value: unknown }> {
  const edits: Array<{ propertyId: string; value: unknown }> = [];
  for (const entry of entries) {
    const property = database.properties[entry.key];
    if (!property) continue;
    const codec = codecFor(property);
    if (!codec.edit) continue;
    const raw = page.properties[property.id];
    // Equal to the stored value's projection: not an edit (legacy/unknown safe).
    if (samePropertyValue(entry.value, codec.project(raw, property, page, NO_RESOLVE))) continue;
    const result = codec.edit(entry.value, property, raw);
    if (result.changed) edits.push({ propertyId: property.id, value: result.value });
  }
  return edits;
}

function samePropertyValue(
  left: PagePropertyEntry["value"],
  right: PagePropertyEntry["value"],
): boolean {
  if ((left == null || left === "") && (right == null || right === "")) return true;
  if (Array.isArray(left) && Array.isArray(right)) return sameStrings(left, right);
  return left === right;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toSafeString).filter(Boolean);
  const item = toSafeString(value);
  return item ? [item] : [];
}

function toSafeString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function toFallbackText(value: unknown): PagePropertyEntry["value"] {
  if (Array.isArray(value)) return value.map(toSafeString).filter(Boolean).join(", ");
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
