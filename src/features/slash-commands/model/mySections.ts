// "My sections": the slash entries for the user's saved sections, and their blocks.
// They are template pages, so their body is fetched like any page's before use.

import { useMemo } from "react";

import type { Block } from "@/entities/block";
import { useUserStore } from "@/features/auth";
import { buildSection } from "@/data/templates/sections/sectionIndex";
import { instantiateTemplateContent } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";

import { mySectionCommands } from "./sectionSlashCommands";
import type { SlashSectionCommand } from "./types";

export function useMySectionCommands(pageId: string | undefined): SlashSectionCommand[] {
  const workspaceId = usePageStore((s) => (pageId ? s.pageById(pageId)?.workspaceId : undefined));
  const pages = usePageStore((s) => (workspaceId ? s.pages[workspaceId] : undefined));
  return useMemo(
    () => (workspaceId && pages ? mySectionCommands(usePageStore.getState().templatePages(workspaceId)) : []),
    [workspaceId, pages],
  );
}

/** A library section, or a saved one: its template page's body, fetched first. */
export async function loadSlashSection(item: SlashSectionCommand): Promise<Block[] | null> {
  if (!item.templatePageId) return buildSection(item.sectionId);
  const store = usePageStore.getState();
  await store.fetchPageContent(item.templatePageId, useUserStore.getState().activePageJwt() ?? "");
  const content = usePageStore.getState().pageById(item.templatePageId)?.content;
  return content ? instantiateTemplateContent(content) : null;
}
