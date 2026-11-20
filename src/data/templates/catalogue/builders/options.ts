/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   options.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SchemaProperty } from "@notion-db/contract-types";

export type Color = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export function selectProperty(
  id: string,
  name: string,
  values: ReadonlyArray<[string, string, Color]>,
  type: "select" | "multi_select" = "select",
): SchemaProperty {
  const options = values.map(([optionId, value, color]) => ({ id: optionId, value, color }));
  return { id, name, type, options };
}
