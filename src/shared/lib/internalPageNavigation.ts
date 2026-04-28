import { usePageStore } from "@/store/usePageStore";

export const INTERNAL_PAGE_LINK_PREFIX = "page://";

export function buildInternalPageHref(pageId: string): string {
  return `${INTERNAL_PAGE_LINK_PREFIX}${pageId}`;
}

export function getInternalPageIdFromHref(href: string): string | null {
  return href.startsWith(INTERNAL_PAGE_LINK_PREFIX)
    ? href.slice(INTERNAL_PAGE_LINK_PREFIX.length)
    : null;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function navigateToInternalPage(pageId: string): boolean {
  const page = usePageStore.getState().pageById(pageId);
  if (!page) {
    return false;
  }

  usePageStore.getState().openPage({
    id: page._id,
    workspaceId: page.workspaceId,
    kind: page.databaseId ? "database" : "page",
    title: page.title,
    icon: page.icon ?? undefined,
  });

  return true;
}
