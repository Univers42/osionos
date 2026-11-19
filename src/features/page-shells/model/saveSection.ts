// "Save section": a container from a page becomes the user's own section, a template
// page in the page's workspace, listed in the slash menu under "My sections".

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { sectionTemplateOf } from "@/store/templateCopy";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@/shared/ui";

export async function saveSection(pageId: string, container: Block): Promise<PageEntry | null> {
  const store = usePageStore.getState();
  const page = store.pageById(pageId);
  if (!page || container.type !== "column_list") return null;
  const jwt = useUserStore.getState().activePageJwt() ?? "";
  const saved = await store.addTemplate(page.workspaceId, jwt, { ...sectionTemplateOf(container), open: false });
  useToastStore.getState().push(saved
    ? { kind: "success", title: `Saved "${saved.title}" to My sections` }
    : { kind: "error", title: "The section could not be saved" });
  return saved;
}
