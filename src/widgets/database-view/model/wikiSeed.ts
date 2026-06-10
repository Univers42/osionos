/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wikiSeed.ts                                         :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Delivery Wiki seed slice (Milestones ↔ Files + ten views), merged into
 * the known-database snapshot UNDER any stored user state — same precedence
 * as the JSON seed, so the wiki databases appear for everyone (including
 * users with existing localStorage) while their own edits still win.
 */

import type { NotionState } from "@notion-db/contract-types";
import { wikiFilesSchema, wikiMilestonesSchema } from "./wikiSeedSchema";
import { wikiSeedPages } from "./wikiSeedPages";
import { wikiSeedViews } from "./wikiSeedViews";

export function applyWikiSeed(state: NotionState): NotionState {
  return {
    databases: {
      ...state.databases,
      [wikiMilestonesSchema.id]: wikiMilestonesSchema,
      [wikiFilesSchema.id]: wikiFilesSchema,
    },
    pages: { ...state.pages, ...wikiSeedPages() },
    views: { ...state.views, ...wikiSeedViews },
  };
}
