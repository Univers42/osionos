import React, { useCallback, useEffect, useMemo, useState } from "react";

import { PageOptionsMenu } from "@/features/page-management";
import { usePageStore } from "@/store/usePageStore";

import { PageBreadcrumbs } from "./PageBreadcrumbs";

const MINUTE_IN_MS = 60_000;
const HOUR_IN_MS = 3_600_000;
const DAY_IN_MS = 86_400_000;

interface PageHeaderBarProps {
  pageId: string;
  workspaceId: string;
}

function formatEditedLabel(updatedAt: string | undefined): string {
  if (!updatedAt) return "Edited recently";

  const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());

  if (Number.isNaN(elapsed)) return "Edited recently";
  if (elapsed < MINUTE_IN_MS) return "Edited just now";

  if (elapsed < HOUR_IN_MS) {
    const min = Math.floor(elapsed / MINUTE_IN_MS);
    return `Edited ${min} min ago`;
  }

  if (elapsed < DAY_IN_MS) {
    const hrs = Math.floor(elapsed / HOUR_IN_MS);
    return `Edited ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(elapsed / DAY_IN_MS);
  return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
}

export const PageHeaderBar: React.FC<PageHeaderBarProps> = ({
  pageId,
  workspaceId,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const [tick, setTick] = useState(0);

  const handleOpenHome = useCallback(() => {
    usePageStore.setState({
      activePage: null,
      showTrash: false,
      navigationPath: [],
    });
  }, []);

  // Refresh the relative label every minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const editedLabel = useMemo(
    () => formatEditedLabel(page?.updatedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.updatedAt, tick],
  );

  return (
    <div className="sticky top-0 z-10 flex h-11 w-full items-center border-b border-[var(--color-line)] bg-[var(--color-surface-primary)]">
      <div className="flex w-full items-center justify-between px-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <PageBreadcrumbs pageId={pageId} onOpenHome={handleOpenHome} />
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-4">
          <span className="hidden whitespace-nowrap text-[13px] text-[var(--color-ink-faint)] sm:inline">
            {editedLabel}
          </span>
          <PageOptionsMenu
            pageId={pageId}
            workspaceId={workspaceId}
            pageTitle={page?.title || "Untitled"}
            isActivePage
            onRedirectHome={handleOpenHome}
          />
        </div>
      </div>
    </div>
  );
};
