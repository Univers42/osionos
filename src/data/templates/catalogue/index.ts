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

type CatalogueEntry = { card: CatalogueCard; load: () => Promise<CatalogueTemplate> };

function entry(card: CatalogueCard, loader: () => Promise<{ default: TemplateBody }>): CatalogueEntry {
  return { card, load: () => loader().then((module) => ({ ...card, ...module.default })) };
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
