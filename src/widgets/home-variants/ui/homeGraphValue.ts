/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphValue.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";

import type { HomeGraphProperty } from "../model/homeKnowledgeGraphData";

export function inputValue(value: HomeGraphProperty["value"], type: HomeGraphProperty["type"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  if (type === "date" && typeof value === "string" && value.includes("T")) return value.slice(0, 10);
  return String(value);
}

export function propertyInputType(type: HomeGraphProperty["type"]): React.HTMLInputTypeAttribute {
  if (type === "number") return "number";
  if (type === "date" || type === "created_time" || type === "last_edited_time" || type === "due_date") return "date";
  return "text";
}

export function stringValue(value: HomeGraphProperty["value"]): string {
  if (Array.isArray(value)) return value[0] ?? "";
  if (value == null) return "";
  return String(value);
}

export function formatPropertyValue(value: HomeGraphProperty["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
}
