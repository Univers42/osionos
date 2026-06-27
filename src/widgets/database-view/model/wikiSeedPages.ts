/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wikiSeedPages.ts                                    :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Rows for the Delivery Wiki databases. Files are generated from a compact
 * manifest (deterministic — no randomness) and the milestone↔file relation is
 * written on BOTH sides, mirroring how the hardcoded two-way seeds keep their
 * arrays consistent. Dates are relative to "now" so timelines/calendars and
 * the date formulas always show a live-looking spread.
 */

import type { Page } from "@notion-db/contract-types";
import { WIKI_FILES_DB_ID, WIKI_MILESTONES_DB_ID } from "./wikiSeedSchema";

const day = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString();
};

/** [id, title, icon, status, quarter, owner, startOffset, dueOffset] */
const MILESTONES: [string, string, string, string, string, string, number, number][] = [
  ["ms1", "Mercury — Public Beta", "🚀", "mss-shipped", "msq-q1", "Dylan", -120, -45],
  ["ms2", "Venus — Realtime Sync", "📡", "mss-flight", "msq-q2", "Marta", -40, 12],
  ["ms3", "Terra — Offline Mode", "🌍", "mss-flight", "msq-q2", "Iris", -25, 30],
  ["ms4", "Mars — Plugin SDK", "🔌", "mss-risk", "msq-q3", "Noah", -10, 8],
  ["ms5", "Jupiter — Enterprise SSO", "🛡️", "mss-planned", "msq-q3", "Dylan", 20, 75],
  ["ms6", "Saturn — Mobile Apps", "📱", "mss-planned", "msq-q4", "Marta", 45, 120],
];

/** [id suffix, title, icon, source option, milestone, tags, sizeKB, modOffset, owner, pinned] */
const FILES: [string, string, string, string, string, string[], number, number, string, boolean][] = [
  ["f01", "Beta launch retrospective", "📝", "wfs-note", "ms1", ["retro"], 18, -40, "Dylan", true],
  ["f02", "Beta pricing decision", "📝", "wfs-note", "ms1", ["meeting"], 9, -52, "Marta", false],
  ["f03", "Launch-day runbook", "📄", "wfs-doc", "ms1", ["spec"], 120, -60, "Iris", true],
  ["f04", "Press kit hero shots", "🖼️", "wfs-image", "ms1", ["design"], 8200, -70, "Noah", false],
  ["f05", "Beta cohort metrics", "📊", "wfs-dataset", "ms1", ["research"], 5400, -47, "Marta", false],
  ["f06", "Sync conflict semantics", "📝", "wfs-note", "ms2", ["spec", "research"], 22, -8, "Marta", true],
  ["f07", "CRDT vs OT evaluation", "📝", "wfs-note", "ms2", ["research"], 31, -15, "Dylan", false],
  ["f08", "Realtime protocol v2 spec", "📄", "wfs-doc", "ms2", ["spec"], 240, -5, "Marta", true],
  ["f09", "Latency benchmark runs", "📊", "wfs-dataset", "ms2", ["research"], 12100, -3, "Iris", false],
  ["f10", "Presence indicator mocks", "🖼️", "wfs-image", "ms2", ["design"], 3900, -11, "Noah", false],
  ["f11", "Sync weekly standup notes", "📝", "wfs-note", "ms2", ["meeting"], 12, -1, "Iris", false],
  ["f12", "Offline cache eviction note", "📝", "wfs-note", "ms3", ["spec"], 16, -6, "Iris", true],
  ["f13", "Service-worker strategy", "📄", "wfs-doc", "ms3", ["spec"], 95, -14, "Dylan", false],
  ["f14", "Conflict UX walkthrough", "🖼️", "wfs-image", "ms3", ["design"], 4700, -9, "Noah", false],
  ["f15", "Field-test telemetry", "📊", "wfs-dataset", "ms3", ["research"], 8800, -2, "Marta", false],
  ["f16", "Offline kickoff minutes", "📝", "wfs-note", "ms3", ["meeting"], 11, -20, "Dylan", false],
  ["f17", "Plugin API surface note", "📝", "wfs-note", "ms4", ["spec"], 27, -4, "Noah", true],
  ["f18", "SDK security review", "📝", "wfs-note", "ms4", ["research"], 19, -2, "Dylan", false],
  ["f19", "Manifest format v1", "📄", "wfs-doc", "ms4", ["spec"], 64, -7, "Noah", false],
  ["f20", "Marketplace wireframes", "🖼️", "wfs-image", "ms4", ["design"], 5100, -12, "Iris", false],
  ["f21", "SSO requirements note", "📝", "wfs-note", "ms5", ["spec"], 14, -3, "Dylan", false],
  ["f22", "SAML vs OIDC comparison", "📄", "wfs-doc", "ms5", ["research"], 88, -6, "Marta", false],
  ["f23", "Enterprise pilot contacts", "📊", "wfs-dataset", "ms5", ["research"], 640, -1, "Dylan", false],
  ["f24", "Mobile nav exploration", "🖼️", "wfs-image", "ms6", ["design"], 6200, -5, "Noah", false],
  ["f25", "React Native spike note", "📝", "wfs-note", "ms6", ["research"], 25, -2, "Iris", true],
  ["f26", "App-store asset bundle", "📦", "wfs-upload", "ms6", ["design"], 15360, -4, "Noah", false],
];

const stamp = (modified: string): Pick<Page, "createdAt" | "updatedAt" | "createdBy" | "lastEditedBy"> => ({
  createdAt: modified,
  updatedAt: modified,
  createdBy: "Dylan",
  lastEditedBy: "Dylan",
});

function milestonePages(): Record<string, Page> {
  const pages: Record<string, Page> = {};
  for (const [id, title, icon, status, quarter, owner, start, due] of MILESTONES) {
    pages[id] = {
      id,
      databaseId: WIKI_MILESTONES_DB_ID,
      icon,
      ...stamp(day(start)),
      properties: {
        "ms-title": title,
        "ms-status": status,
        "ms-quarter": quarter,
        "ms-owner": owner,
        "ms-start": day(start),
        "ms-due": day(due),
        "ms-files": FILES.filter((file) => file[4] === id).map((file) => `wiki-${file[0]}`),
      },
      content: [],
    };
  }
  return pages;
}

function filePages(): Record<string, Page> {
  const pages: Record<string, Page> = {};
  for (const [suffix, title, icon, source, milestone, tags, size, modified, owner, pinned] of FILES) {
    const id = `wiki-${suffix}`;
    pages[id] = {
      id,
      databaseId: WIKI_FILES_DB_ID,
      icon,
      ...stamp(day(modified)),
      properties: {
        "wf-title": title,
        "wf-source": source,
        "wf-milestone": [milestone],
        "wf-tags": tags.map((tag) => `wft-${tag}`),
        "wf-size": size,
        "wf-modified": day(modified),
        "wf-owner": owner,
        "wf-pinned": pinned,
      },
      content: [],
    };
  }
  return pages;
}

export function wikiSeedPages(): Record<string, Page> {
  return { ...milestonePages(), ...filePages() };
}
