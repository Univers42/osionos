/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.catalogue.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { PageEntry, PageStore } from "@/entities/page";
import { notifyTemplateFailure } from "./pageCreateFeedback";

type GetFn = () => PageStore;
type Prepared = { title: string; icon?: string; content: Block[] };

export async function createFromCatalogue(
  get: GetFn,
  templateId: string,
  workspaceId: string,
  jwt: string,
  parentPageId?: string,
  options?: { open?: boolean },
): Promise<PageEntry | null> {
  let prepared: Prepared | null;
  try {
    const { prepareCatalogueTemplate } = await import("@/features/templates/model/catalogueInstantiate");
    prepared = await prepareCatalogueTemplate(templateId, workspaceId);
  } catch (err) {
    return notifyTemplateFailure(err);
  }
  if (!prepared) return null;
  const page = await get().addPage(workspaceId, prepared.title, jwt, parentPageId, {
    icon: prepared.icon, content: prepared.content,
  });
  if (page && options?.open !== false) {
    get().openPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon });
  }
  return page;
}
