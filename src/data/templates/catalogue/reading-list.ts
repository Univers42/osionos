/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reading-list.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { rightSidebarShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `reading-list-${suffix}`;
const DB = key("db-books");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Books", "count"),
  statTile(key("w-pages"), key("v-table"), "Total pages", "sum", key("p-pages")),
  statTile(key("w-rating"), key("v-table"), "Average rating", "avg", key("p-rating")),
  statTile(key("w-genres"), key("v-table"), "Genres in use", "distinct", key("p-genre")),
]);

const views = [
  view(key("v-gallery"), DB, "Book gallery", "gallery", { cardSize: "medium", cardPreview: "none" }),
  { ...view(key("v-board"), DB, "Reading progress", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-table"), DB, "All books", "table"),
  view(key("v-dashboard"), DB, "Reading overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-cartographer"), DB, {
    [key("p-title")]: "The Cartographer's Garden", [key("p-author")]: "Sam",
    [key("p-status")]: key("opt-reading"), [key("p-genre")]: key("opt-fiction"),
    [key("p-pages")]: 336, [key("p-link")]: "https://example.com/books/cartographers-garden",
  }),
  record(key("r-night-trains"), DB, {
    [key("p-title")]: "A Field Guide to Night Trains", [key("p-author")]: "Alex",
    [key("p-status")]: key("opt-to-read"), [key("p-genre")]: key("opt-nonfiction"),
    [key("p-pages")]: 248, [key("p-link")]: "https://example.com/books/night-trains",
  }),
  record(key("r-north-coast"), DB, {
    [key("p-title")]: "Notes from the North Coast", [key("p-author")]: "Priya",
    [key("p-status")]: key("opt-finished"), [key("p-genre")]: key("opt-nonfiction"),
    [key("p-pages")]: 192, [key("p-rating")]: 5, [key("p-finished")]: "2026-09-18T21:00:00.000Z",
    [key("p-link")]: "https://example.com/books/north-coast",
  }),
  record(key("r-quiet-machine"), DB, {
    [key("p-title")]: "The Quiet Machine", [key("p-author")]: "Noor",
    [key("p-status")]: key("opt-reading"), [key("p-genre")]: key("opt-science"),
    [key("p-pages")]: 304, [key("p-link")]: "https://example.com/books/quiet-machine",
  }),
  record(key("r-orchards"), DB, {
    [key("p-title")]: "Orchards After Rain", [key("p-author")]: "Jonas",
    [key("p-status")]: key("opt-finished"), [key("p-genre")]: key("opt-poetry"),
    [key("p-pages")]: 112, [key("p-rating")]: 4, [key("p-finished")]: "2026-10-22T20:00:00.000Z",
    [key("p-link")]: "https://example.com/books/orchards-after-rain",
  }),
  record(key("r-small-worlds"), DB, {
    [key("p-title")]: "Small Worlds of the Sea", [key("p-author")]: "Sam",
    [key("p-status")]: key("opt-to-read"), [key("p-genre")]: key("opt-science"),
    [key("p-pages")]: 280, [key("p-link")]: "https://example.com/books/small-worlds",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(rightSidebarShell, {
    header: [
      heading(key("h-title"), "Reading list", 1),
      p("Keep your next read close, follow books in progress, and remember what earned a high rating."),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-gallery")), dbInline(DB, key("v-board"))],
    right: [
      heading(key("h-details"), "Book details", 2),
      p("Use the table for quick edits to authors, genres, page counts, ratings, and finishing dates."),
      dbInline(DB, key("v-table")),
    ],
  }), "reading-list"),
  databases: database({
    id: DB, name: "Books", icon: "📚",
    properties: [
      { id: key("p-title"), name: "Book", type: "title" },
      { id: key("p-author"), name: "Author", type: "text" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-to-read"), "To read", "gray"], [key("opt-reading"), "Reading", "blue"],
        [key("opt-finished"), "Finished", "green"],
      ]),
      selectProperty(key("p-genre"), "Genre", [
        [key("opt-fiction"), "Fiction", "blue"], [key("opt-nonfiction"), "Nonfiction", "green"],
        [key("opt-poetry"), "Poetry", "purple"], [key("opt-science"), "Science", "orange"],
      ]),
      { id: key("p-pages"), name: "Pages", type: "number" },
      { id: key("p-rating"), name: "Rating", type: "number" },
      { id: key("p-finished"), name: "Finished", type: "date" },
      { id: key("p-link"), name: "Link", type: "url" },
    ],
    views, rows,
  }),
};

export default template;
