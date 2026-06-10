/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   livePresetView.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared curated-view factory for live-mount preset packs (commerce, ops,
 * activity — agency keeps its private twin). One ViewConfig with the pack's
 * namespace under the live database id, the title property excluded from
 * visibleProperties (it always renders), and side-peek opening.
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";

/** One curated ViewConfig (id = `<databaseId>#<pack>-<slug>`). */
export function presetView(
  database: DatabaseSchema,
  pack: string,
  slug: string,
  name: string,
  type: ViewConfig["type"],
  overrides: Partial<Pick<ViewConfig, "grouping" | "sorts" | "settings" | "filters">> = {},
): ViewConfig {
  const visibleProperties = Object.keys(database.properties)
    .filter((propertyId) => propertyId !== database.titlePropertyId);
  return {
    id: `${database.id}#${pack}-${slug}`,
    databaseId: database.id,
    name,
    type,
    filters: [],
    filterConjunction: "and",
    sorts: [],
    visibleProperties,
    settings: { openPagesIn: "side_peek", ...overrides.settings },
    ...((({ settings: _merged, ...rest }) => rest)(overrides)),
  };
}
