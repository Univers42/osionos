/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeSecondBrainProps.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PagePropertyEntry } from "@/entities/page";

import type { HomeGraphProperty } from "../model/homeKnowledgeGraphData";

export function toPageProperty(property: HomeGraphProperty): PagePropertyEntry {
  return {
    key: property.key,
    label: property.label,
    type: pagePropertyType(property.type),
    value: property.value,
    options: property.options,
    relationTarget: property.type === "relation" ? "page" : undefined,
  };
}

export function pagePropertyType(type: HomeGraphProperty["type"]): PagePropertyEntry["type"] {
  if (type === "number") return "number";
  if (type === "checkbox") return "checkbox";
  if (type === "date" || type === "created_time" || type === "last_edited_time" || type === "due_date") return "date";
  if (type === "select" || type === "status") return "select";
  if (type === "url") return "url";
  if (type === "relation") return "relation";
  return "text";
}
