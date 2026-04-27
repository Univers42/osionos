/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageSelectorMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 12:00:00 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/04/20 12:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FileText, Database } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import {
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";

interface PageSelectorMenuProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (pageId: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

type SelectorOption =
  | {
      kind: "page";
      pageId: string;
      title: string;
      icon?: string | null;
      isDatabase: boolean;
    }
  | {
      kind: "create";
      title: string;
    };

export const PageSelectorMenu: React.FC<PageSelectorMenuProps> = ({
  position,
  filter,
  onSelect,
  onCreate,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const pagesMap = usePageStore((s) => s.pages);
  const pages = useMemo(() => Object.values(pagesMap).flat(), [pagesMap]);

  const filteredPages = useMemo(() => {
    const context = getCurrentPageAccessContext();
    const query = filter.toLowerCase().trim();

    return pages
      .filter((p) => !p.archivedAt && canReadPage(p, context))
      .filter((p) => p.title.toLowerCase().includes(query))
      .slice(0, 10); // Limit to top 10 results
  }, [pages, filter]);

  const selectorOptions = useMemo<SelectorOption[]>(() => {
    const query = filter.trim();
    const loweredQuery = query.toLowerCase();

    const pageOptions: SelectorOption[] = filteredPages.map((page) => ({
      kind: "page",
      pageId: page._id,
      title: page.title || "Untitled",
      icon: page.icon,
      isDatabase: Boolean(page.databaseId),
    }));

    if (!query) {
      return pageOptions;
    }

    const hasExactMatch = pages.some((page) => {
      if (page.archivedAt) return false;
      if (!canReadPage(page, getCurrentPageAccessContext())) return false;
      return (page.title || "Untitled").trim().toLowerCase() === loweredQuery;
    });

    if (hasExactMatch) {
      return pageOptions;
    }

    return [
      ...pageOptions,
      {
        kind: "create",
        title: query,
      },
    ];
  }, [filter, filteredPages, pages]);

  const effectiveActiveIdx = Math.min(
    activeIdx,
    Math.max(selectorOptions.length - 1, 0),
  );

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIdx((index) =>
          Math.min(index + 1, selectorOptions.length - 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIdx((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const option = selectorOptions[effectiveActiveIdx];
        if (!option) return;

        if (option.kind === "page") {
          onSelect(option.pageId);
          return;
        }

        onCreate(option.title);
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [effectiveActiveIdx, selectorOptions, onSelect, onCreate, onClose]);

  if (selectorOptions.length === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="fixed z-[10000] flex max-h-[26rem] w-72 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl"
      style={{ top: position.y + 4, left: position.x }}
    >
      <div className="flex flex-1 flex-col">
        <div className="max-h-[26rem] overflow-y-auto py-1.5">
          <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
            Link to page
          </p>
          {selectorOptions.map((option, idx) => {
            const isActive = idx === effectiveActiveIdx;
            let Icon = FileText;
            if (option.kind === "create") {
              Icon = FilePlus2;
            } else if (option.isDatabase) {
              Icon = Database;
            }
            const label =
              option.kind === "create"
                ? `Create page "${option.title}"`
                : option.title;

            return (
              <button
                key={
                  option.kind === "create"
                    ? `create:${option.title}`
                    : option.pageId
                }
                type="button"
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "bg-[var(--color-surface-hover)]"
                    : "hover:bg-[var(--color-surface-hover)]"
                }`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  if (option.kind === "create") {
                    onCreate(option.title);
                    return;
                  }

                  onSelect(option.pageId);
                }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-secondary)] text-[14px]">
                  {option.kind === "page" && option.icon ? (
                    option.icon
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--color-ink)]">
                    {label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
