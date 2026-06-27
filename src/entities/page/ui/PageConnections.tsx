/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageConnections.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { Folder, CornerDownRight, Link2 } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import { backlinkRefs, childRefs, parentRef, type PageRef } from "./pageConnections.helpers";

interface Props {
  pageId: string;
  workspaceId: string;
}

/**
 * Read-only "connections" rows under the page properties: the containing folder, the page's
 * own children, and backlinks (pages that relate to it). Non-folder refs navigate on click;
 * a folder ref is a static label (folders never open).
 */
export const PageConnections: React.FC<Props> = ({ pageId, workspaceId }) => {
  const openPage = usePageStore((s) => s.openPage);
  const wsPages = usePageStore((s) => s.pages[workspaceId]);
  const data = useMemo(() => {
    const all = wsPages ?? [];
    const page = all.find((candidate) => candidate._id === pageId);
    return { parent: parentRef(page, all), children: childRefs(pageId, all), backlinks: backlinkRefs(pageId, all) };
  }, [wsPages, pageId]);

  function go(ref: PageRef) {
    if (ref.surface === "folder") return; // folders never open
    openPage({ id: ref.id, workspaceId, kind: "page", title: ref.title });
  }

  if (!data.parent && data.children.length === 0 && data.backlinks.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 text-sm">
      {data.parent ? <ConnRow icon={<Folder size={13} />} label="In folder" refs={[data.parent]} onGo={go} /> : null}
      {data.children.length ? <ConnRow icon={<CornerDownRight size={13} />} label="Contains" refs={data.children} onGo={go} /> : null}
      {data.backlinks.length ? <ConnRow icon={<Link2 size={13} />} label="Linked from" refs={data.backlinks} onGo={go} /> : null}
    </div>
  );
};

const ConnRow: React.FC<{ icon: React.ReactNode; label: string; refs: PageRef[]; onGo: (ref: PageRef) => void }> = ({
  icon,
  label,
  refs,
  onGo,
}) => (
  <div className="flex items-start gap-1">
    <span className="flex h-7 w-40 shrink-0 items-center gap-1.5 px-1.5 text-[var(--osio-fg-muted)]">{icon}{label}</span>
    <div className="flex flex-1 flex-wrap items-center gap-1 py-0.5">
      {refs.map((ref) => {
        const chip = "inline-flex items-center gap-1 rounded bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-xs";
        if (ref.surface === "folder") {
          return <span key={ref.id} className={chip}><Folder size={11} />{ref.title || "Untitled"}</span>;
        }
        return (
          <button key={ref.id} type="button" onClick={() => onGo(ref)} className={`${chip} hover:bg-[var(--osio-bg-hover)]`}>
            {ref.title || "Untitled"}
          </button>
        );
      })}
    </div>
  </div>
);
