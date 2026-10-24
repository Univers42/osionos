/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   binding.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext, useContext } from "react";

/**
 * Render-time data binding for admin-authored profile templates. A template
 * block stores the sentinel `recordRef: "$viewedUser"`; at render the open
 * profile provides the viewed user's row here, and bound blocks resolve their
 * `fieldBind` against it. Defined in the low `entities/block` layer so the
 * read-only renderer can read it without importing upward into a widget.
 */
export interface BoundRecord {
  id: string;
  customFields?: Record<string, unknown> | null;
  [field: string]: unknown;
}

const BoundRecordContext = createContext<BoundRecord | null>(null);

/** Provider — supplied by the profile widget with the viewed user's record. */
export const BoundRecordProvider = BoundRecordContext.Provider;

/** The current viewed user's record, or null outside a binding context. */
export function useBoundRecord(): BoundRecord | null {
  return useContext(BoundRecordContext);
}

/**
 * The fields a user-authored README may bind: the public profile projection, camel-cased,
 * minus identifiers and images. Admin templates are not limited to it (they also bind
 * `role`, `online`, `custom:*`).
 */
export const README_FIELDS = [
  { key: "displayName", label: "Name", kind: "text" },
  { key: "username", label: "Username", kind: "text" },
  { key: "pronouns", label: "Pronouns", kind: "text" },
  { key: "headline", label: "Headline", kind: "text" },
  { key: "bio", label: "Bio", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "company", label: "Company", kind: "text" },
  { key: "website", label: "Website", kind: "text" },
  { key: "links", label: "Links", kind: "list" },
  { key: "timezone", label: "Time zone", kind: "text" },
  { key: "orcid", label: "ORCID", kind: "text" },
  { key: "patreon", label: "Patreon", kind: "text" },
  { key: "profession", label: "Profession", kind: "text" },
] as const;

export type ReadmeFieldKey = (typeof README_FIELDS)[number]["key"];

const README_FIELD_KEYS: ReadonlySet<string> = new Set(README_FIELDS.map((field) => field.key));

export function isReadmeField(key: unknown): key is ReadmeFieldKey {
  return typeof key === "string" && README_FIELD_KEYS.has(key);
}

/**
 * Text shown when a bound field has no value. The default keeps the admin templates'
 * dash; a README provides `null` so an empty or denied field is invisible to the reader.
 */
export const BoundFieldEmptyText = createContext<string | null>("\u2014");

/**
 * Resolve a `fieldBind` ("headline" | "custom:<key>") against a bound record. Own
 * properties only, so `constructor`, `__proto__` and `toString` resolve to nothing.
 */
export function resolveBoundField(record: BoundRecord | null, fieldBind: string | undefined): unknown {
  if (!record || !fieldBind) return undefined;
  if (fieldBind.startsWith("custom:")) {
    const custom = record.customFields;
    const key = fieldBind.slice(7);
    return custom && Object.hasOwn(custom, key) ? custom[key] : undefined;
  }
  return Object.hasOwn(record, fieldBind) ? record[fieldBind] : undefined;
}

/** The text of a bound value, or null when the field is missing or empty. Arrays join with ", ". */
export function boundFieldText(record: BoundRecord | null, fieldBind: string | undefined): string | null {
  const value = resolveBoundField(record, fieldBind);
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(", ");
  return String(value);
}
