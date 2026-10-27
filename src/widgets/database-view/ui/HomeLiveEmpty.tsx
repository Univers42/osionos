/**
 * Empty state for the Home live carousels. The gallery renders nothing for zero
 * records, which left a bare heading with a blank gap under it; this tells the
 * user what fills the section instead.
 */

import React from "react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { recentEntries } from "../model/recentsDatabaseState";
import { templateEntries } from "../model/templatesDatabaseState";

const EMPTY_COPY = {
  recents: { icon: "🕘", title: "Nothing visited yet", hint: "Pages you open show up here for quick access." },
  templates: { icon: "🧩", title: "No templates yet", hint: "Mark a page as a template and it will be offered here." },
} as const;

/** Live record count behind a Home carousel. The selectors subscribe the component to
 *  the inputs the entry readers use; the read itself is O(recents + templates), so it
 *  is recomputed per render instead of memoised against those inputs. */
function useHomeLiveCount(kind: keyof typeof EMPTY_COPY): number {
  usePageStore((s) => s.recents);
  usePageStore((s) => s.pages);
  useUserStore((s) => s.activeWorkspace()?._id ?? "");
  return (kind === "recents" ? recentEntries() : templateEntries()).length;
}

const HomeLiveEmpty: React.FC<{ kind: keyof typeof EMPTY_COPY }> = ({ kind }) => {
  const copy = EMPTY_COPY[kind];
  return (
    <div
      data-testid={`home-live-empty-${kind}`}
      className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--osio-border-default)] px-4 py-5"
    >
      <span aria-hidden="true" className="text-xl">{copy.icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">{copy.title}</div>
        <div className="text-xs text-[var(--osio-fg-muted)]">{copy.hint}</div>
      </div>
    </div>
  );
};

/** Renders the carousel, or its empty state when nothing backs it. Only mounted for the
 *  two Home carousels, so the store subscriptions never touch ordinary databases. */
export const HomeLiveGate: React.FC<{ kind: keyof typeof EMPTY_COPY; children: React.ReactNode }> = ({ kind, children }) =>
  useHomeLiveCount(kind) === 0 ? <HomeLiveEmpty kind={kind} /> : <>{children}</>;
