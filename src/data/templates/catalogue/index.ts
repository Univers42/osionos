/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// TD22: this module is reached ONLY through import(); keep it out of static imports.
import type { TemplateSource } from "@/features/templates/model/templateSlice";
import { isCatalogueId } from "./tplId";
import type { CatalogueCard, CatalogueTemplate, TemplateBody } from "./types";
import { SHELLS, type ShellMeta } from "./shells/shellIndex";

type CatalogueEntry = { card: CatalogueCard; load: () => Promise<CatalogueTemplate> };

function entry(card: CatalogueCard, loader: () => Promise<{ default: TemplateBody }>): CatalogueEntry {
  return { card, load: () => loader().then((module) => ({ ...card, ...module.default })) };
}

function shellEntry(meta: ShellMeta): CatalogueEntry {
  return entry({ ...meta, id: `tpl:${meta.id}`, category: "page" }, () =>
    import("./shells/shellBuilders").then(({ SHELL_BUILDERS }) => ({
      default: { content: SHELL_BUILDERS[meta.id](), databases: { databases: {}, views: {}, pages: {} } },
    })),
  );
}

const ENTRIES: ReadonlyArray<CatalogueEntry> = [
  entry(
    { id: "tpl:project-tracker", title: "Project tracker", icon: "✅", description: "Plan tasks, priorities, estimates, and due dates in one project view.", category: "work" },
    () => import("./project-tracker"),
  ),
  entry(
    { id: "tpl:sprint-board", title: "Sprint board", icon: "🏃", description: "Balance sprint issues, story points, status, and the team's work mix.", category: "team" },
    () => import("./sprint-board"),
  ),
  entry(
    { id: "tpl:crm-pipeline", title: "CRM pipeline", icon: "🤝", description: "Track deals, companies, close dates, and pipeline value together.", category: "work" },
    () => import("./crm-pipeline"),
  ),
  entry(
    { id: "tpl:content-calendar", title: "Content calendar", icon: "🗓️", description: "Plan editorial work across channels from first draft to publication.", category: "team" },
    () => import("./content-calendar"),
  ),
  entry(
    { id: "tpl:habit-tracker", title: "Habit tracker", icon: "✅", description: "Build steady routines with weekly targets, streaks, and a view by area.", category: "personal" },
    () => import("./habit-tracker"),
  ),
  entry(
    { id: "tpl:reading-list", title: "Reading list", icon: "📚", description: "Organize books by reading status and genre, with ratings and page totals.", category: "personal" },
    () => import("./reading-list"),
  ),
  entry(
    { id: "tpl:student-semester", title: "Student semester", icon: "🎓", description: "Plan assignments, due dates, grades, and courses for the whole semester.", category: "school" },
    () => import("./student-semester"),
  ),
  entry(
    { id: "tpl:personal-finance", title: "Personal finance", icon: "💰", description: "Monitor spending, income, recurring costs, and account activity in one ledger.", category: "personal" },
    () => import("./personal-finance"),
  ),
  entry(
    { id: "tpl:okrs", title: "OKRs", icon: "🎯", description: "Score key results by objective, quarter, progress, and confidence.", category: "work" },
    () => import("./okrs"),
  ),
  entry(
    { id: "tpl:support-desk", title: "Support desk", icon: "🎧", description: "Triage tickets by status, priority, and channel with reply times in view.", category: "team" },
    () => import("./support-desk"),
  ),
  entry(
    { id: "tpl:inventory", title: "Inventory", icon: "📦", description: "Track stock by shelf and category, and reorder before items run out.", category: "work" },
    () => import("./inventory"),
  ),
  entry(
    { id: "tpl:travel-planner", title: "Travel planner", icon: "✈️", description: "Plan a trip day by day with costs, bookings, and a packing list.", category: "personal" },
    () => import("./travel-planner"),
  ),
  entry(
    { id: "tpl:team-wiki-home", title: "Team wiki home", icon: "📖", description: "Give the team one home for onboarding, processes, and engineering docs.", category: "team" },
    () => import("./team-wiki-home"),
  ),
  entry(
    { id: "tpl:product-roadmap", title: "Product roadmap", icon: "🗺️", description: "Plan features by quarter, status, effort, and impact from idea to launch.", category: "work" },
    () => import("./product-roadmap"),
  ),
  entry(
    { id: "tpl:event-planner", title: "Event planner", icon: "🎉", description: "Track event tasks, costs, and deadlines beside the guest list and RSVPs.", category: "personal" },
    () => import("./event-planner"),
  ),
  entry(
    { id: "tpl:job-search", title: "Job search", icon: "💼", description: "Follow every application from saved listing to offer with salary notes.", category: "personal" },
    () => import("./job-search"),
  ),
  ...SHELLS.map(shellEntry),
];

export async function listCatalogue(): Promise<CatalogueCard[]> {
  return ENTRIES.map((entry) => entry.card);
}

/** The entries parameter is a test seam; production always passes ENTRIES. */
export async function loadFrom(entries: ReadonlyArray<CatalogueEntry>, id: string): Promise<TemplateSource | null> {
  if (!isCatalogueId(id)) return null;
  const entry = entries.find(({ card }) => card.id === id);
  if (!entry) return null;
  const loaded = await entry.load();
  return { id, title: loaded.title, content: loaded.content, databases: loaded.databases };
}

export async function loadTemplate(id: string): Promise<TemplateSource | null> {
  return loadFrom(ENTRIES, id);
}
