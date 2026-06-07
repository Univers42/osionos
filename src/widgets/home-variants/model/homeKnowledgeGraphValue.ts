/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeKnowledgeGraphValue.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PropertyType } from "@notion-db/object-database";

import type { HomeGraphProperty } from "./homeKnowledgeGraphData";

export function normalizePropertyValue(value: unknown, type: PropertyType): HomeGraphProperty["value"] {
  if (type === "relation") return arrayValue(value);
  if (type === "checkbox") return Boolean(value);
  if (type === "number") return numberValue(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  const text = textValue(value);
  return text ? [text] : [];
}

export function textValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

export function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
