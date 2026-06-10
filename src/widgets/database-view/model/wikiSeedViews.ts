/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wikiSeedViews.ts                                    :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Views for the Delivery Wiki databases — the full notion-database-sys view
 * arsenal: tables with rollup/formula columns, a status board, a timeline,
 * the Files gallery "collection", a source board, a modified calendar, and
 * the wiki's signature trick: views FILTERED by relation, e.g. "Notes —
 * Venus" = Source equals Note AND Milestone contains ms2.
 */

import type { ViewConfig } from "@notion-db/contract-types";
import { WIKI_FILES_DB_ID, WIKI_MILESTONES_DB_ID } from "./wikiSeedSchema";

const FILE_COLUMNS = ["wf-title", "wf-source", "wf-milestone", "wf-tags", "wf-size", "wf-weight", "wf-age", "wf-modified", "wf-owner", "wf-pinned", "wf-open"];

/** Filtered "notes of milestone X" view — the relation+select filter combo. */
function notesOf(viewId: string, name: string, milestonePageId: string): ViewConfig {
  return {
    id: viewId,
    databaseId: WIKI_FILES_DB_ID,
    name,
    type: "table",
    filters: [
      { id: `${viewId}-f1`, propertyId: "wf-source", operator: "equals", value: "wfs-note" },
      { id: `${viewId}-f2`, propertyId: "wf-milestone", operator: "contains", value: milestonePageId },
    ],
    filterConjunction: "and",
    sorts: [{ id: `${viewId}-s1`, propertyId: "wf-modified", direction: "desc" }],
    visibleProperties: ["wf-title", "wf-tags", "wf-age", "wf-modified", "wf-owner", "wf-pinned"],
    settings: { showPageIcon: true, showRowNumbers: true },
  };
}

export const wikiSeedViews: Record<string, ViewConfig> = {
  "v-wiki-ms-table": {
    id: "v-wiki-ms-table", databaseId: WIKI_MILESTONES_DB_ID, name: "All Milestones", type: "table",
    filters: [], filterConjunction: "and",
    sorts: [{ id: "vmt-s1", propertyId: "ms-due", direction: "asc" }],
    visibleProperties: ["ms-title", "ms-status", "ms-quarter", "ms-owner", "ms-start", "ms-due", "ms-days-left", "ms-health", "ms-files", "ms-file-count", "ms-total-kb", "ms-brief"],
    settings: { showPageIcon: true, showVerticalLines: true },
  },
  "v-wiki-ms-board": {
    id: "v-wiki-ms-board", databaseId: WIKI_MILESTONES_DB_ID, name: "By Status", type: "board",
    filters: [], filterConjunction: "and", sorts: [],
    grouping: { propertyId: "ms-status" },
    visibleProperties: ["ms-title", "ms-owner", "ms-due", "ms-health", "ms-file-count"],
    settings: { showPageIcon: true, cardSize: "medium" },
  },
  "v-wiki-ms-timeline": {
    id: "v-wiki-ms-timeline", databaseId: WIKI_MILESTONES_DB_ID, name: "Roadmap", type: "timeline",
    filters: [], filterConjunction: "and",
    sorts: [{ id: "vmtl-s1", propertyId: "ms-start", direction: "asc" }],
    visibleProperties: ["ms-title", "ms-status", "ms-owner", "ms-health"],
    settings: { showTable: true, zoomLevel: "month", showTimelineBy: "ms-start" },
  },
  "v-wiki-files-table": {
    id: "v-wiki-files-table", databaseId: WIKI_FILES_DB_ID, name: "All Files", type: "table",
    filters: [], filterConjunction: "and",
    sorts: [{ id: "vft-s1", propertyId: "wf-modified", direction: "desc" }],
    visibleProperties: FILE_COLUMNS,
    settings: { showPageIcon: true, showRowNumbers: true, wrapContent: false },
  },
  "v-wiki-files-gallery": {
    id: "v-wiki-files-gallery", databaseId: WIKI_FILES_DB_ID, name: "Collection", type: "gallery",
    filters: [], filterConjunction: "and",
    sorts: [{ id: "vfg-s1", propertyId: "wf-size", direction: "desc" }],
    visibleProperties: ["wf-title", "wf-source", "wf-milestone", "wf-tags", "wf-weight"],
    settings: { cardSize: "medium", cardPreview: "none", showPageIcon: true },
  },
  "v-wiki-files-board": {
    id: "v-wiki-files-board", databaseId: WIKI_FILES_DB_ID, name: "By Source", type: "board",
    filters: [], filterConjunction: "and", sorts: [],
    grouping: { propertyId: "wf-source" },
    visibleProperties: ["wf-title", "wf-milestone", "wf-owner", "wf-age"],
    settings: { showPageIcon: true, cardSize: "small" },
  },
  "v-wiki-files-calendar": {
    id: "v-wiki-files-calendar", databaseId: WIKI_FILES_DB_ID, name: "Activity Calendar", type: "calendar",
    filters: [], filterConjunction: "and", sorts: [],
    visibleProperties: ["wf-title", "wf-source", "wf-owner"],
    settings: { showWeekends: true, showCalendarAs: "month", showCalendarBy: "wf-modified" },
  },
  "v-wiki-files-pinned": {
    id: "v-wiki-files-pinned", databaseId: WIKI_FILES_DB_ID, name: "Pinned", type: "list",
    filters: [{ id: "vfp-f1", propertyId: "wf-pinned", operator: "equals", value: true }],
    filterConjunction: "and",
    sorts: [{ id: "vfp-s1", propertyId: "wf-modified", direction: "desc" }],
    visibleProperties: ["wf-title", "wf-source", "wf-milestone", "wf-owner"],
    settings: { showPageIcon: true },
  },
  "v-wiki-notes-venus": notesOf("v-wiki-notes-venus", "Notes — Venus (Realtime)", "ms2"),
  "v-wiki-notes-mars": notesOf("v-wiki-notes-mars", "Notes — Mars (Plugin SDK)", "ms4"),
};
