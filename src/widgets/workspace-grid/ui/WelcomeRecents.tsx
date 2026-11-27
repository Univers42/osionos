/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WelcomeRecents.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Pick up where you left off" on the empty workspace: the sidebar's own recent
// rows (same menu, rename and delete), for the active workspace only.

import React from "react";
import { useShallow } from "zustand/react/shallow";

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { RecentPageRow } from "@/widgets/activity-rail/ui/RecentPageRow";

const WELCOME_RECENTS_CAP = 5;

/** Renders nothing until a loaded page of this workspace has been visited. */
export const WelcomeRecents: React.FC<{ headingClass: string }> = ({ headingClass }) => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "");
  const openPage = usePageStore((state) => state.openPage);
  const headingId = React.useId();
  // Only loaded pages: a recent whose page is not in the index renders no row, and
  // a heading over zero rows would be a promise with nothing behind it.
  const recents = usePageStore(
    useShallow((state) =>
      state.recents.filter((recent) => recent.workspaceId === workspaceId && state.pagesIndex[recent.id]).slice(0, WELCOME_RECENTS_CAP),
    ),
  );
  if (recents.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={headingClass}>Recent</h2>
      <div className="flex flex-col gap-px">
        {recents.map((recent) => (
          <RecentPageRow key={recent.id} recent={recent} activePageId={null} onOpenPage={openPage} />
        ))}
      </div>
    </section>
  );
};
