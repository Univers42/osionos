/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecordSubItemsPanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 06:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 06:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Sub-items" section shown inside an opened live-record page. Lists the
 * caller's hand-created child notes (each a real osionos page with its own
 * metadata), creates new ones, and opens a child as its own tab (the pane
 * self-loads it). Renders nothing for non-live pages, so it is safe to mount on
 * any database page.
 */

import React from "react";
import { Plus } from "lucide-react";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useUserStore } from "@/features/auth";
import { type PageEntry } from "@/store/usePageStore";
import { createSubItem, listSubItems, openNotePage, openRecordNote, parseLiveRecordRef } from "../model/recordSubItems";
import { RecordChildRecords } from "./RecordChildRecords";

interface RecordSubItemsPanelProps {
  recordPageId: string;
  onOpenChild?: () => void;
  /** Tight styling for the inline table-row expansion (vs the in-page section). */
  compact?: boolean;
}

export const RecordSubItemsPanel: React.FC<RecordSubItemsPanelProps> = ({ recordPageId, onOpenChild, compact }) => {
  const ref = React.useMemo(() => parseLiveRecordRef(recordPageId), [recordPageId]);
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? null);
  const [children, setChildren] = React.useState<PageEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!ref) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    // Persist the record-note so the record "becomes a note" (graph/sidebar) the
    // moment it is opened; idempotent, fire-and-forget.
    void openRecordNote(ref);
    listSubItems(ref).then((res) => { if (alive) { setChildren(res.children); setLoading(false); } });
    return () => { alive = false; };
  }, [ref]);

  if (!ref) return null;

  async function handleCreate() {
    if (!ref || !activeWorkspaceId || creating) return;
    setCreating(true);
    const created = await createSubItem(ref, { workspaceId: activeWorkspaceId, title: "Sub-item" });
    setCreating(false);
    if (created) setChildren((prev) => [created, ...prev]);
  }

  function openChild(child: PageEntry) {
    openNotePage(child);
    onOpenChild?.();
  }

  const indent = compact ? "pl-6 pr-2" : "pl-2 pr-2";
  return (
    <section className={compact ? "py-1" : "mx-auto max-w-3xl px-10 pb-10"}>
      {!compact && <div className="mb-1 border-t border-[var(--osio-border-default)] pt-4" />}
      <h3 className={`${compact ? "pl-6" : "px-2"} pb-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--osio-fg-subtle)]`}>
        Sub-items{children.length ? ` · ${children.length}` : ""}
      </h3>
      {loading ? (
        <p className={`${indent} py-1 text-sm text-[var(--osio-fg-muted)]`}>Loading…</p>
      ) : (
        <div className="flex flex-col">
          {children.map((child) => (
            <button
              key={child._id}
              type="button"
              onClick={() => openChild(child)}
              className={`flex w-full items-center gap-2 rounded-md py-1 ${indent} text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]`}
            >
              <IconValueView value={child.icon ?? "icon:file-text"} size={14} className="shrink-0 opacity-70" />
              <span className="truncate">{child.title || "Untitled"}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !activeWorkspaceId}
            className={`flex w-full items-center gap-1.5 rounded-md py-1 ${indent} text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-50`}
          >
            <Plus size={14} className="shrink-0" /> {creating ? "Adding…" : "New sub-item"}
          </button>
        </div>
      )}
      <RecordChildRecords recordRef={ref} compact={compact} />
    </section>
  );
};
