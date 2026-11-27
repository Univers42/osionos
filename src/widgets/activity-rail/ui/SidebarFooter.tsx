/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarFooter.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 16:29:53 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { UserPlus, X } from "lucide-react";

import { useWorkspaceInvitesStore } from "@/store/settings";
import { openSettings } from "@/features/settings/model/settingsNav";
import { LegalLinks } from "@/features/legal/ui/LegalLinks";

interface SidebarFooterProps {
  showInviteCTA: boolean;
  onDismissInvite: () => void;
}

/** Bottom of the Explorer: the legal links and the optional Invite CTA. Places live on the rail (railItems.ts), never here. */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  showInviteCTA,
  onDismissInvite,
}) => {

  // The People section consumes the invite request to open its invite modal.
  const openInviteSettings = () => {
    useWorkspaceInvitesStore.getState().requestInvite();
    openSettings("people");
  };

  return (
    <>
      <div
        className="h-px w-full shrink-0 -mt-px z-[var(--osio-z-raised)]"
        style={{
          boxShadow: "0 1px 0 var(--osio-border-default)",
          transition: "box-shadow 300ms",
        }}
      />

      <LegalLinks className="px-4 pb-1 pt-1.5" />

      {showInviteCTA && (
        // The dismiss button sits beside the card, not inside it: a button nested in a
        // button is unreachable to assistive tech (WCAG 4.1.2, #224).
        <div className="mx-2 mb-2 mt-1.5 relative">
          <button
            type="button"
            onClick={openInviteSettings}
            className="block w-full p-2 pr-8 text-left rounded-lg overflow-hidden cursor-pointer hover:bg-[var(--osio-bg-hover)] transition-colors duration-(--osio-dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            style={{ boxShadow: "var(--osio-border-default) 0 0 0 1px" }}
          >
            <span className="flex items-start gap-2">
              <UserPlus
                size={20}
                aria-hidden
                className="shrink-0 text-[var(--osio-fg-default)] mt-0.5"
              />
              <span className="flex-1 min-w-0 pt-1">
                <span className="block text-xs font-semibold text-[var(--osio-fg-default)] leading-4">
                  Invite members
                </span>
                <span className="block text-xs text-[var(--osio-fg-muted)] leading-4">
                  Collaborate with your team.
                </span>
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Dismiss invitation"
            onClick={onDismissInvite}
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
};
