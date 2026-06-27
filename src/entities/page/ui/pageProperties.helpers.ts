/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageProperties.helpers.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PagePropertyEntry, PagePropertyType } from "../model/types";

/** Maps an osionos page-property type to a notion-database-sys PropIcon type string. */
export function notionIconType(type: PagePropertyType | undefined): string {
  if (!type) return "text";
  if (type === "person") return "person";
  return type; // number/date/select/multi_select/status/checkbox/url/email/phone/relation map 1:1
}

export interface AddPropertyChoice {
  type: PagePropertyType;
  label: string;
}

/** Property types a page can add from the inspector (Notion-style "Add property" menu). */
export const ADD_PROPERTY_CHOICES: readonly AddPropertyChoice[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "select", label: "Select" },
  { type: "multi_select", label: "Multi-select" },
  { type: "status", label: "Status" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "person", label: "Person" },
  { type: "url", label: "URL" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone" },
  { type: "relation", label: "Relation" },
];

/** Types whose value is an array of strings (chips / related page ids). */
export const MULTI_VALUE_TYPES = new Set<PagePropertyType>(["relation", "multi_select"]);

export function defaultPropertyValue(type: PagePropertyType): PagePropertyEntry["value"] {
  if (type === "checkbox") return false;
  if (type === "number") return null;
  if (MULTI_VALUE_TYPES.has(type)) return [];
  return "";
}

/** Build a unique property entry (stable key derived from the label) for a new property. */
export function makeProperty(
  type: PagePropertyType,
  label: string,
  existing: readonly PagePropertyEntry[],
): PagePropertyEntry {
  const base = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, "") || type;
  const taken = new Set(existing.map((property) => property.key));
  let key = base;
  let suffix = 1;
  while (taken.has(key)) key = `${base}_${suffix++}`;
  return { key, label, type, value: defaultPropertyValue(type) };
}

/** Coerce any stored value to an array of strings (for relation / multi-select rendering). */
export function asStringArray(value: PagePropertyEntry["value"]): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (value == null || value === "") return [];
  return [String(value)];
}
