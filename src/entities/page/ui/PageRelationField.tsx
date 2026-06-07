/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageRelationField.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import type { PagePropertyEntry } from "../model/types";
import { asStringArray } from "./pageProperties.helpers";

interface Props {
  workspaceId: string;
  excludePageId: string;
  value: PagePropertyEntry["value"];
  editable: boolean;
  onChange: (ids: string[]) => void;
}

/** Relation value cell: related pages as navigable chips + a picker to relate other pages. */
export const PageRelationField: React.FC<Props> = ({ workspaceId, excludePageId, value, editable, onChange }) => {
  const [picking, setPicking] = useState(false);
  const ids = asStringArray(value);
  const openPage = usePageStore((s) => s.openPage);
  const wsPages = usePageStore((s) => s.pages[workspaceId]);
  const pages = useMemo(
    () => (wsPages ?? []).filter((page) => !page.archivedAt).map((page) => ({ id: page._id, title: page.title })),
    [wsPages],
  );
  const titleOf = (id: string) => pages.find((page) => page.id === id)?.title || "Untitled";
  const candidates = pages.filter((page) => page.id !== excludePageId && !ids.includes(page.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--osio-fg-default)]">
          <button type="button" className="max-w-40 truncate hover:underline" onClick={() => openPage({ id, workspaceId, kind: "page", title: titleOf(id) })}>
            {titleOf(id)}
          </button>
          {editable ? (
            <button type="button" title="Remove relation" onClick={() => onChange(ids.filter((other) => other !== id))}>
              <X size={11} />
            </button>
          ) : null}
        </span>
      ))}
      {ids.length === 0 && !editable ? <span className="text-sm text-[var(--osio-fg-subtle)]">No relations</span> : null}
      {editable ? (
        <div className="relative">
          <button type="button" onClick={() => setPicking((open) => !open)}
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
            <Plus size={12} /> Relate
          </button>
          {picking ? (
            <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-lg">
              {candidates.length === 0 ? (
                <p className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)]">No other pages</p>
              ) : (
                candidates.map((page) => (
                  <button key={page.id} type="button" onClick={() => { onChange([...ids, page.id]); setPicking(false); }}
                    className="block w-full truncate px-2 py-1 text-left text-sm hover:bg-[var(--osio-bg-hover)]">
                    {page.title || "Untitled"}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
