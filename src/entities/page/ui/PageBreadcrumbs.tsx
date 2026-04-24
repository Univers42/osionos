import React, { useCallback, useMemo } from "react";
import { ChevronRight } from "lucide-react";

import type { PageEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";

interface PageBreadcrumbsProps {
  pageId: string;
  onOpenHome?: () => void;
}

function toActivePage(page: PageEntry) {
  return {
    id: page._id,
    workspaceId: page.workspaceId,
    kind: page.databaseId ? ("database" as const) : ("page" as const),
    title: page.title,
    icon: page.icon,
  };
}

/**
 * Notion-style breadcrumbs for the current page hierarchy.
 */
export const PageBreadcrumbs: React.FC<PageBreadcrumbsProps> = ({
  pageId,
  onOpenHome,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const activePage = usePageStore((s) => s.activePage);
  const openPage = usePageStore((s) => s.openPage);

  const resolvedWorkspaceId = page?.workspaceId ?? activePage?.workspaceId;

  const workspacePages = usePageStore((s) => {
    if (!resolvedWorkspaceId) return [];
    return s.pages[resolvedWorkspaceId] ?? [];
  });

  const breadcrumbs = useMemo(() => {
    if (!page) {
      if (activePage?.id !== pageId) return [];
      return [
        {
          _id: activePage.id,
          workspaceId: activePage.workspaceId,
          title: activePage.title ?? "Untitled",
          icon: activePage.icon,
        } as PageEntry,
      ];
    }

    const pageById = new Map(workspacePages.map((entry) => [entry._id, entry]));
    const path: PageEntry[] = [];
    const visited = new Set<string>();

    let current: PageEntry | undefined = page;
    while (current && !visited.has(current._id)) {
      path.unshift(current);
      visited.add(current._id);
      current = current.parentPageId
        ? pageById.get(current.parentPageId)
        : undefined;
    }

    return path;
  }, [page, workspacePages, activePage, pageId]);

  const handleOpenCrumb = useCallback(
    (entry: PageEntry) => {
      openPage(toActivePage(entry));
    },
    [openPage],
  );

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav className="notion-page-breadcrumbs" aria-label="Page breadcrumbs">
      {onOpenHome && (
        <>
          <button
            type="button"
            className="notion-page-breadcrumb notion-page-breadcrumb--root"
            onClick={onOpenHome}
          >
            Home
          </button>
          <ChevronRight
            size={12}
            className="notion-page-breadcrumb-separator"
          />
        </>
      )}

      {breadcrumbs.map((entry, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={entry._id}>
            {isLast ? (
              <span
                className="notion-page-breadcrumb notion-page-breadcrumb--current"
                aria-current="page"
                title={entry.title || "Untitled"}
              >
                {entry.title || "Untitled"}
              </span>
            ) : (
              <button
                type="button"
                className="notion-page-breadcrumb"
                onClick={() => handleOpenCrumb(entry)}
                title={entry.title || "Untitled"}
              >
                {entry.title || "Untitled"}
              </button>
            )}

            {!isLast && (
              <ChevronRight
                size={12}
                className="notion-page-breadcrumb-separator"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
