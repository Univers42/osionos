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
// table, so its views (All files, Recents, Favorites, Shared, Private,
// Templates, Skills), filters, sorts and search are the database's own. The
// heading paints before the database chunk loads.

import React, { Suspense } from "react";
import { Plus } from "lucide-react";
import { LIBRARY_DB_ID } from "@/widgets/database-view/model/libraryDatabaseModel";
import { createLibraryPage } from "@/widgets/database-view/model/libraryItems";

const DatabaseBlock = React.lazy(() =>
  import("@/widgets/database-view/ui/DatabaseBlock").then((m) => ({ default: m.DatabaseBlock })),
);

export const PageLibraryView: React.FC = () => (
  <div role="region" aria-label="Library" className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-page)]">
    <header className="flex flex-wrap items-center gap-3 px-[clamp(18px,4cqw,48px)] pb-1 pt-5">
      <h1 className="mr-auto text-2xl font-semibold leading-8 text-[var(--osio-fg-default)]">Library</h1>
      <button
        type="button"
        onClick={() => void createLibraryPage()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        <Plus size={14} aria-hidden="true" />
        New page
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-[clamp(6px,3cqw,36px)] pb-10" data-testid="library-database">
      <Suspense fallback={<p role="status" className="px-3 py-6 text-sm text-[var(--osio-fg-muted)]">Loading files…</p>}>
        <DatabaseBlock databaseId={LIBRARY_DB_ID} mode="full" />
      </Suspense>
    </div>
  </div>
);
