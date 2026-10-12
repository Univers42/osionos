/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditorTitleBar.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { PageHeaderBar } from "@/entities/page";
import { usePageHeaderBarProps } from "@/entities/page/model/usePageHeaderBarProps";
import { usePageStore } from "@/store/usePageStore";
import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

interface EditorTitleBarProps {
  tab: WorkspaceTab;
}

/** Same height/surface as PageHeaderBar so swapping between the two never shifts content. */
const BAR_CLASS =
  "flex h-11 w-full min-w-0 shrink-0 items-center border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]";

/** Hooks cannot be conditional, so the page variant is its own component. */
const PageTitleBar: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => {
  const headerProps = usePageHeaderBarProps(tab.pageId, tab.workspaceId);
  return <PageHeaderBar key={tab.pageId} {...headerProps} />;
};

const PlainTitleBar: React.FC<{ title: string }> = ({ title }) => (
  <div className={`${BAR_CLASS} px-4`}>
    <span className="min-w-0 truncate text-sm text-[var(--osio-fg-default)]">{title}</span>
  </div>
);

/**
 * The single per-pane chrome of the workbench: page tabs (block, code, database page)
 * get the full page bar (breadcrumbs, share, favourite, tools); other tabs just their
 * title. The region is named after the document so several panes stay distinguishable.
 */
export const EditorTitleBar: React.FC<EditorTitleBarProps> = ({ tab }) => {
  const pageTitle = usePageStore((s) => s.pageById(tab.pageId)?.title);
  const isPage = tab.kind === "page";
  const title = (isPage ? pageTitle : undefined) || tab.title || "Untitled";

  return (
    <section aria-label={`Title bar: ${title}`} data-osio-editor-titlebar className="shrink-0">
      {isPage ? <PageTitleBar tab={tab} /> : <PlainTitleBar title={title} />}
    </section>
  );
};
