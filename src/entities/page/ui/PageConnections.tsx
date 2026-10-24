/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageConnections.tsx                                :+:      :+:    :+:   */
/*                                                    :+:     :::         */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :::       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { Folder, CornerDownRight, Link2, AtSign, Sparkles, Link as LinkIcon } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import { useBacklinks } from "../model/useBacklinks";
import { useRelatedPages } from "../model/useRelatedPages";
import { backlinkRefs, childRefs, mergeRefs, parentRef, withPageMention, type PageRef } from "./pageConnections.helpers";

interface Props {
  pageId: string;
  workspaceId: string;
}

/**
 * Read-only "connections" rows under the page properties: the containing folder, the page's
 * own children, and backlinks (pages that relate to it). Non-folder refs navigate on click;
 * a folder ref is a static label (folders never open).
 *
 * The related pages and the suggested links come from the assistant's service, computed
 * for the viewer at the moment of the read. A click inserts the mention of the page at the
 * end of the page — through the normal edit path, never a server write.
 */
export const PageConnections: React.FC<Props> = ({ pageId, workspaceId }) => {
  const openPage = usePageStore((s) => s.openPage);
  const updateBlock = usePageStore((s) => s.updateBlock);
  const insertBlock = usePageStore((s) => s.insertBlock);
  const wsPages = usePageStore((s) => s.pages[workspaceId]);
  const { linked, mentions } = useBacklinks(pageId);
  const { state: relatedState, related } = useRelatedPages(pageId);
  const data = useMemo(() => {
    const all = wsPages ?? [];
    const page = all.find((candidate) => candidate._id === pageId);
    // Relation-property backlinks ∪ inline [[page]] backlinks (deduped by id).
    const backlinks = mergeRefs(backlinkRefs(pageId, all), linked.map((ref) => ({ id: ref.id, title: ref.title })));
    const mentionRefs = mentions.map((ref) => ({ id: ref.id, title: ref.title }));
    return { parent: parentRef(page, all), children: childRefs(pageId, all), backlinks, mentionRefs, page };
  }, [wsPages, pageId, linked, mentions]);

  function go(ref: PageRef) {
    if (ref.surface === "folder") return; // folders never open
    openPage({ id: ref.id, workspaceId, kind: "page", title: ref.title });
  }

  /** The mention of a page, at the end of the page: the normal edit path. */
  function link(pageTargetId: string) {
    const blocks = data.page?.content ?? [];
    const last = blocks[blocks.length - 1];
    if (last && (last.type === "paragraph" || last.type === "quote")) {
      updateBlock(pageId, last.id, { content: withPageMention(last.content ?? "", pageTargetId) });
      return;
    }
    insertBlock(pageId, last?.id ?? "", {
      id: crypto.randomUUID(),
      type: "paragraph",
      content: withPageMention("", pageTargetId),
    });
  }

  const suggestions = related.filter((page) => !page.linked);
  const nothing =
    !data.parent &&
    data.children.length === 0 &&
    data.backlinks.length === 0 &&
    data.mentionRefs.length === 0 &&
    related.length === 0 &&
    relatedState !== "loading";
  if (nothing) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 text-sm">
      {data.parent ? <ConnRow icon={<Folder size={12} />} label="In folder" refs={[data.parent]} onGo={go} /> : null}
      {data.children.length ? <ConnRow icon={<CornerDownRight size={12} />} label="Contains" refs={data.children} onGo={go} /> : null}
      {data.backlinks.length ? <ConnRow icon={<Link2 size={12} />} label="Linked from" refs={data.backlinks} onGo={go} /> : null}
      {data.mentionRefs.length ? <ConnRow icon={<AtSign size={12} />} label="Mentions" refs={data.mentionRefs} onGo={go} /> : null}
      {relatedState === "loading" ? (
        <ConnRow icon={<Sparkles size={12} />} label="Related pages" refs={[]} status="Looking for related pages…" />
      ) : null}
      {relatedState === "error" ? (
        <ConnRow icon={<Sparkles size={12} />} label="Related pages" refs={[]} status="Related pages are not available." />
      ) : null}
      {related.length ? (
        <ConnRow
          icon={<Sparkles size={12} />}
          label="Related pages"
          refs={related.map((page) => ({ id: page.pageId, title: page.title }))}
          onGo={go}
          onLink={(id) => link(id)}
        />
      ) : null}
      {suggestions.length ? (
        <ConnRow
          icon={<LinkIcon size={12} />}
          label="Suggested links"
          refs={suggestions.map((page) => ({ id: page.pageId, title: page.title }))}
          onGo={go}
          onLink={(id) => link(id)}
        />
      ) : null}
    </div>
  );
};

interface ConnRowProps {
  icon: React.ReactNode;
  label: string;
  refs: PageRef[];
  status?: string;
  onGo?: (ref: PageRef) => void;
  onLink?: (id: string) => void;
}

const ConnRow: React.FC<ConnRowProps> = ({ icon, label, refs, status, onGo, onLink }) => (
  <div className="flex items-start gap-1 min-w-0 max-w-full">
    <span className="flex h-7 w-32 sm:w-40 shrink-0 items-center gap-1.5 px-1.5 text-[var(--osio-fg-muted)]">
      {icon}
      {label}
    </span>
    <div className="flex flex-1 flex-wrap items-center gap-1 py-0.5 min-w-0">
      {status ? (
        <span role="status" className="text-xs text-[var(--osio-fg-muted)]">
          {status}
        </span>
      ) : null}
      {refs.map((ref) => {
        const chip = "inline-flex items-center gap-1 rounded-xs bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-xs";
        if (ref.surface === "folder") {
          return <span key={ref.id} className={chip}><Folder size={11} />{ref.title || "Untitled"}</span>;
        }
        // A page that can be linked: ONE click links it, and the small arrow
        // opens it. A page that cannot: the click opens it, as the other rows.
        return (
          <span key={ref.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => (onLink ? onLink(ref.id) : onGo?.(ref))}
              className={`${chip} hover:bg-[var(--osio-bg-hover)]`}
              title={onLink ? `Link ${ref.title || "Untitled"} at the end of the page` : `Open ${ref.title || "Untitled"}`}
            >
              {ref.title || "Untitled"}
            </button>
            {onLink ? (
              <button
                type="button"
                onClick={() => onGo?.(ref)}
                className="ml-0.5 inline-flex items-center rounded-xs p-0.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
                title={`Open ${ref.title || "Untitled"}`}
                aria-label={`Open ${ref.title || "Untitled"}`}
              >
                <CornerDownRight size={11} />
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  </div>
);
