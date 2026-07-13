/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectionsCatalog.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

import React from "react";

export type ConnCategory =
  | "Google Workspace"
  | "Communication"
  | "Productivity & PM"
  | "Developer"
  | "Design & Whiteboard"
  | "Analytics & Data"
  | "CRM & Sales"
  | "Finance"
  | "Storage & Files"
  | "Security & Observability";

export interface ConnApp {
  id: string;
  name: string;
  description: string;
  category: ConnCategory;
  color: string; // brand accent for the icon tile (offline-safe stand-in for a logo)
  mark: string; // 1–2 char monogram
  /** true → real OAuth is wired and works today (creds present in this repo). */
  live?: boolean;
  /** Google OAuth scope requested when connecting a `live` Google app. */
  scope?: string;
}

const G = "https://www.googleapis.com/auth"; // Google scope prefix

// Ordered for Discover display; the grid groups by `category`. `live` apps
// authenticate for real; the rest are catalog entries that go live when their
// provider's OAuth client_id/secret is configured (see connectionsOAuth).
export const CONNECTIONS_CATALOG: ConnApp[] = [
  // Google Workspace — real OAuth (dev.pro.photo Google client already in repo)
  { id: "google-calendar", name: "Google Calendar", description: "See events on your pages and create them from osionos.", category: "Google Workspace", color: "#4285F4", mark: "GC", live: true, scope: `${G}/calendar` },
  { id: "gmail", name: "Gmail", description: "Preview threads and turn emails into tasks and notes.", category: "Google Workspace", color: "#EA4335", mark: "GM", live: true, scope: `${G}/gmail.modify` },
  { id: "google-drive", name: "Google Drive", description: "Embed and search Drive files without leaving osionos.", category: "Google Workspace", color: "#1FA463", mark: "GD", live: true, scope: `${G}/drive.readonly` },
  { id: "google-contacts", name: "Google Contacts", description: "Mention and enrich people from your Google contacts.", category: "Google Workspace", color: "#1A73E8", mark: "Gc", live: true, scope: `${G}/contacts.readonly` },
  // Communication
  { id: "slack", name: "Slack", description: "Preview threads and send page notifications to channels.", category: "Communication", color: "#4A154B", mark: "Sl" },
  { id: "microsoft-teams", name: "Microsoft Teams", description: "Share pages and get updates in your Teams channels.", category: "Communication", color: "#4B53BC", mark: "Tm" },
  { id: "discord", name: "Discord", description: "Post page updates and previews to your servers.", category: "Communication", color: "#5865F2", mark: "Dc" },
  { id: "zoom", name: "Zoom", description: "Attach meetings and drop recordings into notes.", category: "Communication", color: "#2D8CFF", mark: "Zm" },
  { id: "outlook", name: "Outlook", description: "Bring Outlook mail and calendar into your workspace.", category: "Communication", color: "#0A65C1", mark: "Ol" },
  { id: "intercom", name: "Intercom", description: "Link conversations and customers to your docs.", category: "Communication", color: "#1F8DED", mark: "Ic" },
  { id: "zendesk", name: "Zendesk", description: "Attach support tickets and previews to pages.", category: "Communication", color: "#03363D", mark: "Zd" },
  { id: "microsoft-contacts", name: "Microsoft Contacts", description: "Mention and enrich people from Microsoft 365.", category: "Communication", color: "#0A65C1", mark: "Mc" },
  // Productivity & PM
  { id: "asana", name: "Asana", description: "Sync tasks and projects with your pages.", category: "Productivity & PM", color: "#F06A6A", mark: "As" },
  { id: "jira", name: "Jira", description: "Link issues and sprints; preview them inline.", category: "Productivity & PM", color: "#2684FF", mark: "Ji" },
  { id: "linear", name: "Linear", description: "Attach issues and cycles to specs and docs.", category: "Productivity & PM", color: "#5E6AD2", mark: "Ln" },
  { id: "trello", name: "Trello", description: "Embed boards and cards into your workspace.", category: "Productivity & PM", color: "#0079BF", mark: "Tr" },
  { id: "clickup", name: "ClickUp", description: "Bring tasks, docs and goals into osionos.", category: "Productivity & PM", color: "#7B68EE", mark: "Cu" },
  { id: "shortcut", name: "Shortcut", description: "Link stories and epics to your pages.", category: "Productivity & PM", color: "#5B4CE5", mark: "Sc" },
  { id: "n8n", name: "n8n", description: "Trigger and run workflow automations from pages.", category: "Productivity & PM", color: "#EA4B71", mark: "n8" },
  { id: "streak", name: "Streak Share", description: "Share pipelines and CRM boxes into docs.", category: "Productivity & PM", color: "#4285F4", mark: "St" },
  // Developer
  { id: "github", name: "GitHub", description: "Link issues and PRs and preview repos in pages.", category: "Developer", color: "#24292E", mark: "GH" },
  { id: "gitlab", name: "GitLab", description: "Attach merge requests and pipelines to docs.", category: "Developer", color: "#FC6D26", mark: "GL" },
  { id: "sentry", name: "Sentry", description: "Surface error issues next to your runbooks.", category: "Developer", color: "#362D59", mark: "Se" },
  // Design & Whiteboard
  { id: "figma", name: "Figma", description: "Embed designs, prototypes and comments live.", category: "Design & Whiteboard", color: "#F24E1E", mark: "Fg" },
  { id: "miro", name: "Miro", description: "Embed boards and keep them in sync.", category: "Design & Whiteboard", color: "#FFD02F", mark: "Mi" },
  { id: "lucidchart", name: "Lucidchart", description: "Embed diagrams that update with the source.", category: "Design & Whiteboard", color: "#F2811D", mark: "Lc" },
  { id: "lucidspark", name: "Lucidspark", description: "Bring whiteboards and stickies into pages.", category: "Design & Whiteboard", color: "#F89C1C", mark: "Ls" },
  { id: "whimsical", name: "Whimsical", description: "Embed flowcharts, wireframes and mind maps.", category: "Design & Whiteboard", color: "#7B4CFF", mark: "Wh" },
  { id: "adobe-xd", name: "Adobe XD", description: "Preview XD designs and specs inline.", category: "Design & Whiteboard", color: "#FF61F6", mark: "Xd" },
  { id: "eraser", name: "Eraser", description: "Embed diagrams-as-code and docs.", category: "Design & Whiteboard", color: "#000000", mark: "Er" },
  { id: "pitch", name: "Pitch", description: "Embed and present decks from your pages.", category: "Design & Whiteboard", color: "#131417", mark: "Pi" },
  { id: "claap", name: "Claap", description: "Attach async video recordings to docs.", category: "Design & Whiteboard", color: "#5B5BD6", mark: "Cl" },
  { id: "plus", name: "Plus", description: "Embed live snapshots from other tools.", category: "Design & Whiteboard", color: "#111111", mark: "Pl" },
  { id: "dovetail", name: "Dovetail", description: "Bring research insights and highlights in.", category: "Design & Whiteboard", color: "#3A6DF0", mark: "Dv" },
  // Analytics & Data
  { id: "amplitude", name: "Amplitude", description: "Embed product analytics charts in pages.", category: "Analytics & Data", color: "#1E61F0", mark: "Am" },
  { id: "mixpanel", name: "Mixpanel", description: "Drop funnels and reports into docs.", category: "Analytics & Data", color: "#7856FF", mark: "Mx" },
  { id: "clickhouse", name: "ClickHouse", description: "Query and embed live tables and charts.", category: "Analytics & Data", color: "#FAFF69", mark: "Ch" },
  { id: "hex", name: "Hex", description: "Embed notebooks and data apps inline.", category: "Analytics & Data", color: "#111111", mark: "Hx" },
  // CRM & Sales
  { id: "salesforce", name: "Salesforce", description: "Sync records and pipelines with your workspace.", category: "CRM & Sales", color: "#00A1E0", mark: "Sf" },
  { id: "hubspot", name: "HubSpot", description: "Sync CRM contacts and deals into pages.", category: "CRM & Sales", color: "#FF7A59", mark: "Hs" },
  { id: "attio", name: "Attio", description: "Bring your CRM records and lists into docs.", category: "CRM & Sales", color: "#111111", mark: "At" },
  // Finance
  { id: "stripe", name: "Stripe", description: "Preview payments, customers and invoices.", category: "Finance", color: "#635BFF", mark: "St" },
  { id: "mercury", name: "Mercury", description: "Surface balances and transactions in pages.", category: "Finance", color: "#5266EB", mark: "Me" },
  { id: "ramp", name: "Ramp", description: "Bring spend and card activity into docs.", category: "Finance", color: "#E4F222", mark: "Ra" },
  { id: "sendowl", name: "SendOwl", description: "Attach product sales and delivery data.", category: "Finance", color: "#7AB800", mark: "So" },
  // Storage & Files
  { id: "box", name: "Box", description: "Embed and search Box files and folders.", category: "Storage & Files", color: "#0061D5", mark: "Bx" },
  { id: "dropbox", name: "Dropbox", description: "Embed and preview Dropbox files in pages.", category: "Storage & Files", color: "#0061FF", mark: "Db" },
  { id: "sharepoint", name: "SharePoint & OneDrive", description: "Bring Microsoft 365 files into your workspace.", category: "Storage & Files", color: "#038387", mark: "Sp" },
  // Security & Observability
  { id: "wiz", name: "Wiz", description: "Surface cloud security findings in runbooks.", category: "Security & Observability", color: "#0254EC", mark: "Wz" },
  { id: "datadog", name: "Datadog", description: "Embed dashboards and monitors in pages.", category: "Security & Observability", color: "#632CA6", mark: "Dd" },
  { id: "drata", name: "Drata", description: "Track compliance controls next to docs.", category: "Security & Observability", color: "#5850EC", mark: "Dr" },
  { id: "nightfall", name: "Nightfall AI", description: "Flag and review sensitive-data findings.", category: "Security & Observability", color: "#1F6FEB", mark: "Nf" },
  { id: "panther", name: "Panther", description: "Attach detections and alerts to runbooks.", category: "Security & Observability", color: "#111111", mark: "Pa" },
  { id: "runreveal", name: "RunReveal", description: "Bring security log detections into pages.", category: "Security & Observability", color: "#111111", mark: "Rr" },
  { id: "splunk", name: "Splunk", description: "Embed searches and dashboards in docs.", category: "Security & Observability", color: "#FF5C00", mark: "Sk" },
  { id: "sumologic", name: "Sumo Logic", description: "Surface log analytics next to incidents.", category: "Security & Observability", color: "#000099", mark: "Su" },
  { id: "pagerduty", name: "PagerDuty", description: "Link incidents and on-call to runbooks.", category: "Security & Observability", color: "#06AC38", mark: "Pd" },
  { id: "artemis", name: "Artemis", description: "Attach security assessments to your docs.", category: "Security & Observability", color: "#111111", mark: "Ar" },
];

export const CONNECTIONS_CATEGORIES: ConnCategory[] = [
  "Google Workspace", "Communication", "Productivity & PM", "Developer",
  "Design & Whiteboard", "Analytics & Data", "CRM & Sales", "Finance",
  "Storage & Files", "Security & Observability",
];

export function findConnApp(appId: string): ConnApp | undefined {
  return CONNECTIONS_CATALOG.find((app) => app.id === appId);
}

/** Brand tile: a colored square with a monogram (offline-safe stand-in for a logo). */
export const ConnIcon: React.FC<{ app: ConnApp; size?: number }> = ({ app, size = 36 }) => (
  <span
    aria-hidden="true"
    className="flex shrink-0 items-center justify-center rounded-lg font-semibold"
    style={{ width: size, height: size, background: app.color, color: "#fff" }}
  >
    <span style={{ fontSize: size * 0.34, lineHeight: 1 }}>{app.mark}</span>
  </span>
);
