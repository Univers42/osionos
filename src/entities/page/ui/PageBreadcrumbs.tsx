/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBreadcrumbs.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo } from "react";
import { ChevronRight } from "lucide-react";

import type { PageEntry } from "@/entities/page";
import { ancestorChain } from "@/entities/page/model/ancestorChain";
import { usePageStore } from "@/store/usePageStore";

const EMPTY_WORKSPACE_PAGES: PageEntry[] = [];

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
 * osionos-style breadcrumbs for the current page hierarchy.
 */
export const PageBreadcrumbs: React.FC<PageBreadcrumbsProps> = ({
  pageId,
  onOpenHome,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const activePage = usePageStore((s) => s.activePage);
  const navigationPath = usePageStore((s) => s.navigationPath);
  const openPage = usePageStore((s) => s.openPage);

  const resolvedWorkspaceId = page?.workspaceId ?? activePage?.workspaceId;

  const workspacePages = usePageStore((s) => {
    if (!resolvedWorkspaceId) return EMPTY_WORKSPACE_PAGES;
    return s.pages[resolvedWorkspaceId] ?? EMPTY_WORKSPACE_PAGES;
  });

  const breadcrumbs = useMemo(() => {
    // Where the page lives, not how the reader got here: the history trail put
    // the previously open page in front of an unrelated one ("Home ›
    // transcendance › 05 · Actividad de citas" on live, 2026-10-26).
    if (page) return ancestorChain(page, workspacePages);

    // Page not loaded yet: the history trail is all there is.
    if (navigationPath.at(-1)?.id === pageId) {
      return navigationPath.map((ap): PageEntry => ({
        _id: ap.id,
        workspaceId: ap.workspaceId,
        title: ap.title ?? "Untitled",
        icon: ap.icon,
      }));
    }

    if (activePage?.id !== pageId) return [];
    return [{
      _id: activePage.id,
      workspaceId: activePage.workspaceId,
      title: activePage.title ?? "Untitled",
      icon: activePage.icon,
    }];
  }, [page, workspacePages, activePage, pageId, navigationPath]);

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
    <nav className="osionos-page-breadcrumbs" aria-label="Page breadcrumbs">
      {onOpenHome && (
        <>
          <button
            type="button"
            className="osionos-page-breadcrumb osionos-page-breadcrumb--root"
            onClick={onOpenHome}
          >
            Home
          </button>
          <ChevronRight
            size={12}
            className="osionos-page-breadcrumb-separator"
          />
        </>
      )}

      {breadcrumbs.map((entry, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={entry._id}>
            {isLast ? (
              <span
                className="osionos-page-breadcrumb osionos-page-breadcrumb--current"
                aria-current="page"
                title={entry.title || "Untitled"}
              >
                {entry.title || "Untitled"}
              </span>
            ) : (
              <button
                type="button"
                className="osionos-page-breadcrumb"
                onClick={() => handleOpenCrumb(entry)}
                title={entry.title || "Untitled"}
              >
                {entry.title || "Untitled"}
              </button>
            )}

            {!isLast && (
              <ChevronRight
                size={12}
                className="osionos-page-breadcrumb-separator"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
