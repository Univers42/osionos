/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeSandboxTree.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronDown, ChevronRight, FileIcon, Folder, HardDrive } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { buildVPath } from "../vfs/vpath";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { bridgeFsTransport } from "../vfs/bridgeTransport";
import type { ListedEntry } from "../vfs/types";
import { subscribeFsEvents } from "../model/ideFsEvents";

const dirsFirst = (entries: ListedEntry[]): ListedEntry[] =>
  [...entries].sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : 1) : a.kind === "dir" ? -1 : 1));

/** The explorer's second root (ADR-001 mount honesty): the sandbox's REAL tree
 *  — everything the terminal created, including what the page sync skips
 *  (binaries, node_modules, >512KiB). Browse-only: synced text files open from
 *  the workspace tree above; the rest lives terminal-side. */
export const IdeSandboxTree: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const [open, setOpen] = React.useState(false);
  const [listings, setListings] = React.useState<Map<string, ListedEntry[] | "error">>(new Map());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const provider = React.useMemo(
    () => (workspaceId ? createSandboxProvider("sandbox", bridgeFsTransport(workspaceId)) : null),
    [workspaceId],
  );

  const load = React.useCallback(
    async (rel: string) => {
      if (!provider) return;
      try {
        const entries = dirsFirst(await provider.list(buildVPath("sandbox", workspaceId, rel.split("/").filter(Boolean))));
        setListings((prev) => new Map(prev).set(rel, entries));
      } catch {
        setListings((prev) => new Map(prev).set(rel, "error"));
      }
    },
    [provider, workspaceId],
  );

  React.useEffect(() => {
    if (!open || !workspaceId) return;
    void load("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeFsEvents(workspaceId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setListings((prev) => {
          for (const rel of prev.keys()) void load(rel);
          return prev;
        });
      }, 500);
    });
    return () => { off(); clearTimeout(timer); };
  }, [open, workspaceId, load]);

  const toggleDir = (rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else { next.add(rel); void load(rel); }
      return next;
    });
  };

  const renderDir = (rel: string, depth: number): React.ReactNode => {
    const listing = listings.get(rel);
    if (listing === "error") {
      return <p className="px-3 py-1 text-[11px] text-[var(--osio-code-fg-muted)]" style={{ paddingLeft: 12 + depth * 12 }}>sandbox not connected</p>;
    }
    if (!listing) return null;
    return listing.map((entry) => {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.kind === "dir") {
        const isOpen = expanded.has(childRel);
        return (
          <React.Fragment key={childRel}>
            <button
              type="button"
              onClick={() => toggleDir(childRel)}
              className="flex w-full items-center gap-1 px-3 py-0.5 text-left text-[12px] text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.10))]"
              style={{ paddingLeft: 12 + depth * 12 }}
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Folder size={12} className="text-[var(--osio-code-fg-muted)]" />
              <span className="truncate">{entry.name}</span>
            </button>
            {isOpen && renderDir(childRel, depth + 1)}
          </React.Fragment>
        );
      }
      return (
        <div
          key={childRel}
          title="Synced text files open from the workspace tree above; binaries live terminal-side."
          className="flex w-full items-center gap-1 px-3 py-0.5 text-[12px] text-[var(--osio-code-fg-muted)]"
          style={{ paddingLeft: 24 + depth * 12 }}
        >
          <FileIcon size={12} />
          <span className="truncate">{entry.name}</span>
        </div>
      );
    });
  };

  return (
    <div className="border-t border-[var(--osio-code-border)]">
      <button
        type="button"
        data-sandbox-root
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-full items-center gap-1 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <HardDrive size={12} /> Sandbox
      </button>
      {open && <div className="pb-1">{renderDir("", 0)}</div>}
    </div>
  );
};
