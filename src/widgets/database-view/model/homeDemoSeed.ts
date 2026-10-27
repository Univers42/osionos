/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeDemoSeed.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ─── Home demo seed: Events + Learn databases ───────────────────────────────
// Two small NDS databases the redesigned Home embeds (Upcoming events list +
// Learn carousel). Event dates are day offsets from an injected "today" (the
// real clock by default, a fixed Date in tests) so the "upcoming" filter is
// always meaningful. Merged into the known-database snapshot by knownDatabaseState's
// seedSnapshot via applyHomeDemoSeed(state) — additive, mirrors applyWikiSeed.
//
// Lives in its OWN module (not databaseViewCatalog.ts) to avoid a circular
// import: knownDatabaseState ← databaseViewCatalog ← knownDatabaseState would
// run applyHomeDemoSeed at the store's module-eval time, hitting TDZ on these
// consts. This module imports only contract-types + the pure .meta ids.

import type { DatabaseSchema, NotionState, Page, ViewConfig } from "@notion-db/contract-types";
import { EVENTS_DB_ID, LEARN_DB_ID } from "./databaseViewCatalog.meta";

const at9 = (date: string): string => `${date}T09:00:00.000Z`;

/** Local calendar day of `today` shifted by `offsetDays`, as YYYY-MM-DD. */
export function homeDemoDay(today: Date, offsetDays: number): string {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

const eventStatusFor = (offsetDays: number): string =>
  offsetDays < 0 ? "evs-past" : offsetDays === 0 ? "evs-today" : "evs-upcoming";

const eventsSchema: DatabaseSchema = {
  id: EVENTS_DB_ID,
  name: "Events",
  icon: "📅",
  description: "Upcoming and past events for the workspace home.",
  titlePropertyId: "ev-title",
  properties: {
    "ev-title": { id: "ev-title", name: "Event", type: "title" },
    "ev-date": { id: "ev-date", name: "Date", type: "date" },
    "ev-status": {
      id: "ev-status", name: "Status", type: "status",
      options: [
        { id: "evs-upcoming", value: "Upcoming", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "evs-today", value: "Today", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "evs-past", value: "Past", color: "bg-surface-muted text-ink-strong" },
      ],
    },
    "ev-category": {
      id: "ev-category", name: "Category", type: "select",
      options: [
        { id: "evc-meeting", value: "Meeting", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "evc-workshop", value: "Workshop", color: "bg-warning-surface-medium text-warning-text-tag" },
        { id: "evc-social", value: "Social", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "evc-release", value: "Release", color: "bg-danger-surface-medium text-danger-text-tag" },
        { id: "evc-deadline", value: "Deadline", color: "bg-surface-muted text-ink-strong" },
      ],
    },
    "ev-location": { id: "ev-location", name: "Location", type: "text" },
  },
};

const learnSchema: DatabaseSchema = {
  id: LEARN_DB_ID,
  name: "Learn",
  icon: "🎓",
  description: "Getting-started cards and tips for the workspace home.",
  titlePropertyId: "ln-title",
  properties: {
    "ln-title": { id: "ln-title", name: "Topic", type: "title" },
    "ln-summary": { id: "ln-summary", name: "Summary", type: "text" },
    "ln-category": {
      id: "ln-category", name: "Category", type: "select",
      options: [
        { id: "lnc-start", value: "Getting started", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "lnc-tips", value: "Tips", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "lnc-shortcuts", value: "Shortcuts", color: "bg-warning-surface-medium text-warning-text-tag" },
      ],
    },
    "ln-icon": { id: "ln-icon", name: "Icon", type: "text" },
  },
};

/** [id, title, icon, day offset from today, category, location] */
const HOME_EVENTS: [string, string, string, number, string, string][] = [
  ["ev01", "Team kickoff sync", "🤝", -14, "evc-meeting", "Room A"],
  ["ev02", "Design review workshop", "🎨", -8, "evc-workshop", "Studio 2"],
  ["ev03", "Sprint retrospective", "🔁", -2, "evc-meeting", "Room B"],
  ["ev04", "Open office hours", "☕", 0, "evc-social", "Lounge"],
  ["ev05", "Roadmap planning", "🗺️", 3, "evc-meeting", "Room A"],
  ["ev06", "New-member onboarding", "🌱", 7, "evc-workshop", "Studio 1"],
  ["ev07", "Community meetup", "🎉", 14, "evc-social", "Rooftop"],
  ["ev08", "Version 2.0 release", "🚀", 22, "evc-release", "Remote"],
  ["ev09", "Quarterly all-hands", "📣", 35, "evc-meeting", "Main Hall"],
  ["ev10", "Docs freeze deadline", "📌", 49, "evc-deadline", "Remote"],
];

/** [id, topic, icon, summary, category] — our own generic onboarding copy. */
const HOME_LEARN: [string, string, string, string, string][] = [
  ["ln1", "Create your first page", "📄", "Click + in the sidebar to add a page, then just start typing — everything autosaves.", "lnc-start"],
  ["ln2", "Insert anything with /", "➕", "Type / anywhere to open the block menu: headings, lists, tables, media and more.", "lnc-tips"],
  ["ln3", "Organize with folders", "🗂️", "Drag pages onto each other in the sidebar to nest them and keep a tidy tree.", "lnc-start"],
  ["ln4", "Turn data into views", "🧱", "Show one database as a table, board, gallery or calendar — many lenses, one source.", "lnc-tips"],
  ["ln5", "Drag to rearrange", "✋", "Grab a block's handle to move it, or drop it beside another to build columns.", "lnc-tips"],
  ["ln6", "Move faster with keys", "⌨️", "Open the command palette to search, and the shortcut sheet to see every key.", "lnc-shortcuts"],
];

const homeStamp = (date: string): Pick<Page, "createdAt" | "updatedAt" | "createdBy" | "lastEditedBy"> => ({
  createdAt: at9(date),
  updatedAt: at9(date),
  createdBy: "Dylan",
  lastEditedBy: "Dylan",
});

function homeDemoPages(today: Date): Record<string, Page> {
  const pages: Record<string, Page> = {};
  for (const [id, title, icon, offset, category, location] of HOME_EVENTS) {
    const date = homeDemoDay(today, offset);
    pages[id] = {
      id, databaseId: EVENTS_DB_ID, icon, ...homeStamp(date),
      properties: {
        "ev-title": title, "ev-date": at9(date), "ev-status": eventStatusFor(offset),
        "ev-category": category, "ev-location": location,
      },
      content: [],
    };
  }
  for (const [id, title, icon, summary, category] of HOME_LEARN) {
    pages[id] = {
      id, databaseId: LEARN_DB_ID, icon, ...homeStamp(homeDemoDay(today, 0)),
      properties: {
        "ln-title": title, "ln-summary": summary, "ln-category": category, "ln-icon": icon,
      },
      content: [],
    };
  }
  return pages;
}

function homeDemoViews(today: Date): Record<string, ViewConfig> {
  return {
    "v-events-upcoming": {
      id: "v-events-upcoming", databaseId: EVENTS_DB_ID, name: "Upcoming", type: "list",
      filters: [{ id: "vev-up-f1", propertyId: "ev-date", operator: "is_on_or_after", value: at9(homeDemoDay(today, 0)) }],
      filterConjunction: "and",
      sorts: [{ id: "vev-up-s1", propertyId: "ev-date", direction: "asc" }],
      visibleProperties: ["ev-title", "ev-date", "ev-status", "ev-category", "ev-location"],
      settings: { showPageIcon: true },
    },
    "v-events-calendar": {
      id: "v-events-calendar", databaseId: EVENTS_DB_ID, name: "Calendar", type: "calendar",
      filters: [], filterConjunction: "and", sorts: [],
      visibleProperties: ["ev-title", "ev-status", "ev-category", "ev-location"],
      settings: { showWeekends: true, showCalendarAs: "month", showCalendarBy: "ev-date" },
    },
    "v-learn-cards": {
      id: "v-learn-cards", databaseId: LEARN_DB_ID, name: "Learn", type: "gallery",
      filters: [], filterConjunction: "and", sorts: [],
      visibleProperties: ["ln-title", "ln-summary", "ln-category"],
      settings: { cardSize: "medium", cardPreview: "page_cover", galleryLayout: "carousel", showPageIcon: true },
    },
  };
}

/** Merge the Events + Learn demo databases into a known-database snapshot.
 *  Additive (these ids are unique, so no collision with the JSON seed or the
 *  wiki seed). Mirrors applyWikiSeed; called from knownDatabaseState seedSnapshot. */
export function applyHomeDemoSeed(state: NotionState, today: Date = new Date()): NotionState {
  return {
    databases: { ...state.databases, [eventsSchema.id]: eventsSchema, [learnSchema.id]: learnSchema },
    pages: { ...state.pages, ...homeDemoPages(today) },
    views: { ...state.views, ...homeDemoViews(today) },
  };
}

/** Re-anchor the stored demo events to `today`. Stored state overlays the seed, so
 *  without this a returning user keeps the dates of the day their snapshot was first
 *  written and "Upcoming" drifts into the past. Only date/status/updatedAt of the
 *  seeded event ids and the Upcoming filter are overwritten; other edits survive.
 *  Caveat: a user's manual edit to a demo event's date or status is reset on load. */
export function rebaseHomeDemoDates(state: NotionState, today: Date = new Date()): NotionState {
  const fresh = homeDemoPages(today);
  const pages = { ...state.pages };
  for (const [id] of HOME_EVENTS) {
    const stored = pages[id];
    if (!stored) continue;
    const { "ev-date": date, "ev-status": status } = fresh[id].properties;
    pages[id] = { ...stored, properties: { ...stored.properties, "ev-date": date, "ev-status": status } };
  }
  const upcoming = state.views["v-events-upcoming"];
  const views = upcoming
    ? { ...state.views, "v-events-upcoming": { ...upcoming, filters: homeDemoViews(today)["v-events-upcoming"].filters } }
    : state.views;
  return { ...state, pages, views };
}
