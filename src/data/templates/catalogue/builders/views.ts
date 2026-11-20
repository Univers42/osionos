/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   views.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ViewConfig, ViewSettings, ViewType } from "@notion-db/contract-types";

/** A catalogue view with the empty defaults every view config requires. */
export function view(
  id: string,
  databaseId: string,
  name: string,
  type: ViewType,
  settings: ViewSettings = {},
): ViewConfig {
  return { id, databaseId, name, type, filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings };
}
