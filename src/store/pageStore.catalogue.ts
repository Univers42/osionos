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
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";
import { captureOpenOrigin, openCreatedPage } from "@/widgets/workspace-grid/model/createdPageOpen";
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
  // Catalogue templates carry region cells: TD18 keeps them off until osio.layout.modes (ADR 0067 RD6).
  if (!isLayoutModesEnabled()) return null;
  const origin = captureOpenOrigin(options?.open !== false);
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
  if (page) openCreatedPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon }, origin);
  return page;
}
