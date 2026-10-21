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

import type { PagePropertyEntry } from "@/entities/page";
import type {
  DatabaseSchema as EngineDatabaseSchema,
  Page as EnginePage,
} from "@notion-db/contract-types";

export type DatabaseSchema = EngineDatabaseSchema;
export type DatabasePage = EnginePage;

export function toOsionosPageProperties(database: DatabaseSchema, page: DatabasePage): PagePropertyEntry[] {
  return Object.values(database.properties).map((property) => ({
    key: property.id,
    label: property.name,
    type: toOsionosPropertyType(property.type),
    value: toOsionosPropertyValue(page.properties[property.id], property.type),
    options: property.options?.map((option) => option.value),
    relationTarget: property.type === 'relation' ? 'page' : undefined,
  }));
}

function toOsionosPropertyType(type: DatabaseSchema['properties'][string]['type']): PagePropertyEntry['type'] {
  if (type === 'number') return 'number';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date' || type === 'created_time' || type === 'last_edited_time' || type === 'due_date') return 'date';
  if (type === 'select' || type === 'status') return 'select';
  if (type === 'url') return 'url';
  if (type === 'relation') return 'relation';
  return 'text';
}

function toOsionosPropertyValue(value: unknown, type: DatabaseSchema['properties'][string]['type']): PagePropertyEntry['value'] {
  if (type === 'relation') return toStringArray(value);
  // A place value is `{address, lat?, lng?}` — show the address name, not the raw
  // object (otherwise the opened record's property reads `{"address":"Reims"}`).
  if (type === 'place') {
    if (value && typeof value === 'object' && 'address' in value) {
      const addr = (value as { address?: unknown }).address;
      return typeof addr === 'string' ? addr : '';
    }
    return typeof value === 'string' ? value : '';
  }
  if (type === 'checkbox') return Boolean(value);
  if (type === 'number') return toNumber(value);
  if (Array.isArray(value)) return value.map(toSafeString).filter(Boolean).join(', ');
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
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
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
