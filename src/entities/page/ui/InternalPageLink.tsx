/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   InternalPageLink.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 12:00:00 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/04/20 12:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { FileText, Database } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import { getInternalPageLinkMetadata } from "@/entities/page/model/internalLinkMetadata";

interface InternalPageLinkProps {
  pageId: string;
}

export const InternalPageLink: React.FC<InternalPageLinkProps> = ({ pageId }) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const openPage = usePageStore((s) => s.openPage);
  const linkMetadata = getInternalPageLinkMetadata(page);

  if (!page) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[var(--osio-bg-subtle)] px-1 py-0.5 text-[var(--osio-fg-subtle)]">
        <FileText className="h-3 w-3" />
        <span className="text-sm">{linkMetadata.title}</span>
      </span>
    );
  }

  const Icon = page.databaseId ? Database : FileText;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openPage({
      id: page._id,
      workspaceId: page.workspaceId,
      kind: page.databaseId ? "database" : "page",
      title: page.title,
      icon: page.icon,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="editor-mention align-baseline border-none"
      style={{ display: "inline-flex" }}
    >
      <span className="flex items-center justify-center text-base mr-1.5">
        {linkMetadata.icon || <Icon className="h-3.5 w-3.5" />}
      </span>
      <span className="text-sm underline">
        {linkMetadata.title}
      </span>
    </button>
  );
};
