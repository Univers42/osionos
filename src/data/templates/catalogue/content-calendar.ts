/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   content-calendar.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { headerFooterShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow, viewTile } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `content-calendar-${suffix}`;
const DB = key("db-posts");


const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-gallery"), "Posts", "count"),
  statTile(key("w-status"), key("v-gallery"), "Statuses in use", "distinct", key("p-status")),
  viewTile(key("w-calendar"), key("v-calendar"), "Publishing calendar"),
  viewTile(key("w-gallery"), key("v-gallery"), "Editorial gallery"),
]);

const views = [
  view(key("v-calendar"), DB, "Publishing calendar", "calendar", { showCalendarBy: key("p-publish"), showCalendarAs: "month" }),
  { ...view(key("v-board"), DB, "Editorial workflow", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-gallery"), DB, "Post gallery", "gallery", { cardSize: "medium", cardPreview: "none" }),
  view(key("v-dashboard"), DB, "Content overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-launch"), DB, {
    [key("p-title")]: "How we plan a calm product launch", [key("p-status")]: key("opt-scheduled"),
    [key("p-channel")]: [key("opt-website"), key("opt-newsletter")],
    [key("p-publish")]: "2026-11-23T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/calm-launch",
  }),
  record(key("r-keyboard"), DB, {
    [key("p-title")]: "Five keyboard shortcuts for a faster draft", [key("p-status")]: key("opt-review"),
    [key("p-channel")]: [key("opt-website"), key("opt-social")],
    [key("p-publish")]: "2026-11-24T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/faster-drafts",
  }),
  record(key("r-research"), DB, {
    [key("p-title")]: "A practical guide to customer research", [key("p-status")]: key("opt-draft"),
    [key("p-channel")]: [key("opt-website")],
    [key("p-publish")]: "2026-11-26T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/research-guide",
  }),
  record(key("r-templates"), DB, {
    [key("p-title")]: "Behind the scenes of our new templates", [key("p-status")]: key("opt-scheduled"),
    [key("p-channel")]: [key("opt-social"), key("opt-video")],
    [key("p-publish")]: "2026-11-27T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/new-templates",
  }),
  record(key("r-notes"), DB, {
    [key("p-title")]: "Turn meeting notes into useful decisions", [key("p-status")]: key("opt-published"),
    [key("p-channel")]: [key("opt-newsletter")],
    [key("p-publish")]: "2026-11-20T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/meeting-decisions",
  }),
  record(key("r-accessible"), DB, {
    [key("p-title")]: "A short tour of accessible editing", [key("p-status")]: key("opt-draft"),
    [key("p-channel")]: [key("opt-video"), key("opt-social")],
    [key("p-publish")]: "2026-11-30T09:00:00.000Z", [key("p-url")]: "https://example.com/posts/accessible-editing",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(headerFooterShell, {
    header: [
      heading(key("h-title"), "Content calendar", 1),
      p("Shape ideas into a steady publishing rhythm with clear channels, review states, and dates."),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-calendar")), dbInline(DB, key("v-board"))],
    footer: [
      heading(key("h-rhythm"), "Keep the rhythm sustainable", 2),
      p("Review the coming week together, leave room for revisions, and reuse strong ideas across channels."),
    ],
  }), "content-calendar"),
  databases: database({
    id: DB, name: "Posts", icon: "🗓️",
    properties: [
      { id: key("p-title"), name: "Post", type: "title" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-draft"), "Draft", "gray"], [key("opt-review"), "Review", "yellow"],
        [key("opt-scheduled"), "Scheduled", "blue"], [key("opt-published"), "Published", "green"],
      ]),
      selectProperty(key("p-channel"), "Channels", [
        [key("opt-website"), "Website", "blue"], [key("opt-newsletter"), "Newsletter", "purple"],
        [key("opt-social"), "Social", "pink"], [key("opt-video"), "Video", "red"],
      ], "multi_select"),
      { id: key("p-publish"), name: "Publish date", type: "date" },
      { id: key("p-url"), name: "Post URL", type: "url" },
    ],
    views, rows,
  }),
};

export default template;
