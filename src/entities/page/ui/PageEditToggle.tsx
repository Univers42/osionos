/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageEditToggle.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { Button } from "@/shared/ui";
import { useToastStore } from "@/shared/ui";
import { canEditPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import { usePageActions } from "@/entities/page/model/usePageActions";
import { runPageAction } from "@/entities/page/model/runPageAction";

export interface PageEditToggleProps {
  pageId: string;
}

/** Visible Edit/View switch for a page. Reads the same `locked` state as the
 *  "Lock page" menu item; pressing it toggles the lock through the page
 *  actions, so a locked page stays live (buttons and fields still work) but
 *  stops being editable. */
export const PageEditToggle: React.FC<PageEditToggleProps> = ({ pageId }) => {
  const actions = usePageActions(pageId);
  const accessContext = usePageAccessContext();
  const pushToast = useToastStore((state) => state.push);

  const canEdit = actions.page ? canEditPage(actions.page, accessContext) : false;
  if (!canEdit) return null;

  function showActionError(message: string) {
    pushToast({ kind: "error", title: message });
  }

  const pressed = !actions.config.locked;

  return (
    <Button
      size="sm"
      tone="ghost"
      aria-pressed={pressed}
      className={pressed ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-strong)]" : undefined}
      onClick={() => runPageAction(actions.toggleLock(), showActionError)}
    >
      Edit
    </Button>
  );
};
