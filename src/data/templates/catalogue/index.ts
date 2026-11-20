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
import type { CatalogueCard, CatalogueTemplate } from "./types";

type CatalogueEntry = { card: CatalogueCard; load: () => Promise<CatalogueTemplate> };

const ENTRIES: ReadonlyArray<CatalogueEntry> = [];

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
