/* ************************************************************************** */
/*                                                                            */
/*   PageLibraryView.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Library: a heading and the workspace's files as one database — the real
// table, so its views (files, recents, favorites, access, scope and one per
// category), filters, sorts and search are the database's own. "New" makes a
// page, or a Doc, Rule or Hook: a page the Library files under that kind. The
// heading paints before the database chunk loads.

import React, { Suspense, useRef, useState } from "react";
import { BookOpen, ChevronDown, FileText, Scale, Webhook } from "lucide-react";
import { Menu, MenuItem, Popover } from "@/shared/ui";
import { LIBRARY_DB_ID, LIBRARY_KIND_NOTES, type LibraryKind } from "@/widgets/database-view/model/libraryDatabaseModel";
import { createLibraryPage } from "@/widgets/database-view/model/libraryItems";

const DatabaseBlock = React.lazy(() =>
  import("@/widgets/database-view/ui/DatabaseBlock").then((m) => ({ default: m.DatabaseBlock })),
);

const NEW_ITEMS: ReadonlyArray<{ label: string; note: string; kind?: LibraryKind; Icon: typeof FileText }> = [
  { label: "Page", note: "A blank page", Icon: FileText },
  { label: "Doc", note: LIBRARY_KIND_NOTES.Doc, kind: "Doc", Icon: BookOpen },
  { label: "Rule", note: LIBRARY_KIND_NOTES.Rule, kind: "Rule", Icon: Scale },
  { label: "Hook", note: LIBRARY_KIND_NOTES.Hook, kind: "Hook", Icon: Webhook },
];

const NewMenu: React.FC = () => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        New
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={close} align="end">
        <Menu aria-label="New in the Library" className="w-72">
          {NEW_ITEMS.map(({ label, note, kind, Icon }) => (
            <MenuItem key={label} icon={<Icon size={16} aria-hidden="true" />} onClick={() => { close(); void createLibraryPage(undefined, kind); }}>
              <span className="block">{label}</span>
              <span className="block whitespace-normal text-xs text-[var(--osio-fg-muted)]">{note}</span>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </>
  );
};

export const PageLibraryView: React.FC = () => (
  <div role="region" aria-label="Library" className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-page)]">
    <header className="flex flex-wrap items-center gap-3 px-[clamp(18px,4cqw,48px)] pb-1 pt-5">
      <h1 className="mr-auto text-2xl font-semibold leading-8 text-[var(--osio-fg-default)]">Library</h1>
      <NewMenu />
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-[clamp(6px,3cqw,36px)] pb-10" data-testid="library-database">
      <Suspense fallback={<p role="status" className="px-3 py-6 text-sm text-[var(--osio-fg-muted)]">Loading files…</p>}>
        <DatabaseBlock databaseId={LIBRARY_DB_ID} mode="full" />
      </Suspense>
    </div>
  </div>
);
