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
import {
  Settings,
  LayoutGrid,
  Archive,
  Database,
  UserPlus,
  X,
} from "lucide-react";

import { SidebarNavItem } from "./SidebarNavItem";

interface SidebarFooterProps {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
  showInviteCTA: boolean;
  onDismissInvite: () => void;
}

// Parity gate: the BaaS console nav item only exists when a project is
// configured, so a stock build (no VITE_BAAS_URL) renders byte-identical.
const BAAS_ENABLED = Boolean((import.meta.env ?? {}).VITE_BAAS_URL);

/** Bottom section: Settings / Marketplace / archived files + optional Invite CTA. */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  onOpenSettings,
  onOpenTrash,
  onOpenConsole,
  showInviteCTA,
  onDismissInvite,
}) => {
  return (
    <>
      <div
        className="h-px w-full shrink-0 -mt-px z-[var(--osio-z-raised)]"
        style={{
          boxShadow: "0 1px 0 var(--osio-border-default)",
          transition: "box-shadow 300ms",
        }}
      />

      <div className="px-2 pt-1 flex flex-col gap-px">
        <SidebarNavItem
          icon={<Settings size={16} />}
          label="Settings"
          onClick={() => onOpenSettings?.()}
        />
        <SidebarNavItem
          icon={<LayoutGrid size={16} />}
          label="Marketplace"
          onClick={() => {
            /* placeholder */
          }}
        />
        <SidebarNavItem
          icon={<Archive size={16} />}
          label="Archived files"
          onClick={() => onOpenTrash?.()}
        />
        {BAAS_ENABLED && (
          <SidebarNavItem
            icon={<Database size={16} />}
            label="BaaS Console"
            onClick={() => onOpenConsole?.()}
          />
        )}
      </div>

      {showInviteCTA && (
        <div className="mx-2 mb-2 mt-1.5 relative">
          <div
            className="relative p-2 rounded-lg overflow-hidden cursor-pointer hover:bg-[var(--osio-bg-hover)] transition-colors duration-100"
            style={{ boxShadow: "var(--osio-border-default) 0 0 0 1px" }}
          >
            <div className="flex items-start gap-2">
              <UserPlus
                size={20}
                className="shrink-0 text-[var(--osio-fg-default)] mt-0.5"
              />
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-xs font-semibold text-[var(--osio-fg-default)] leading-4">
                  Invite members
                </p>
                <p className="text-xs text-[var(--osio-fg-muted)] leading-4">
                  Collaborate with your team.
                </p>
              </div>
            </div>
            {/* Dismiss button */}
            <button
              type="button"
              aria-label="Dismiss invitation"
              onClick={(e) => {
                e.stopPropagation();
                onDismissInvite();
              }}
              className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
