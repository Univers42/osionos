/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageOptionsMenu.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:55 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@/shared/ui";
import { PageOptionsPanel, type PageOptionsSurface } from "./PageOptionsPanel";

interface Props {
  pageId: string;
  pageTitle: string;
  isActivePage: boolean;
  workspaceId?: string;
  onRedirectHome: () => void;
}

/**
 * The "…" options trigger of a page. One is mounted per sidebar row and stays closed,
 * so it subscribes to nothing: the menu and its dialogs (PageOptionsPanel) mount only
 * while open. Mounted closed, their selectors ran for every row on every store commit,
 * O(rows) work per keystroke (tests/e2e/perf/titleTyping.spec.mjs).
 */
export const PageOptionsMenu: React.FC<Props> = ({ pageId, pageTitle, workspaceId, onRedirectHome }) => {
  const [open, setOpen] = useState<PageOptionsSurface | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isMenuOpen = open === "menu";

  return (
    <div className="relative flex items-center">
      <IconButton
        ref={triggerRef}
        size="xs"
        tone="muted"
        className={[
          "rounded-[var(--osio-radius-sm)] transition-colors duration-[var(--osio-dur-fast)]",
          isMenuOpen
            ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
            : "hover:bg-[var(--osio-bg-hover)]",
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(isMenuOpen ? null : "menu");
        }}
        label="Page options" title="Page options"
      >
        <MoreHorizontal size={12} />
      </IconButton>
      {open && (
        <PageOptionsPanel
          pageId={pageId}
          pageTitle={pageTitle}
          workspaceId={workspaceId}
          onRedirectHome={onRedirectHome}
          triggerRef={triggerRef}
          open={open}
          setOpen={setOpen}
        />
      )}
    </div>
  );
};
