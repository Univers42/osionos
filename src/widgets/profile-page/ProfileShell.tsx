/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileShell.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profile page's layout: banner, then a sidebar and a main column. One column under
 * 768 px with the sidebar first; from 768 px the sidebar is 296 px and the main column
 * takes the rest. Wraps the default and the profession branch; the admin-template branch
 * keeps its own layout.
 */

import React from "react";

import { isSafeImageSource } from "@/shared/lib/media/bridgeMediaUrl";

interface ProfileShellProps {
  bannerUrl?: string | null;
  sidebar: React.ReactNode;
  /** The edit form needs more room than the identity column. */
  wideSidebar?: boolean;
  children: React.ReactNode;
}

export const ProfileShell: React.FC<ProfileShellProps> = ({ bannerUrl, sidebar, wideSidebar, children }) => {
  // Only an https URL or a same-origin path is drawn; the field is the allowlisted bannerUrl, nothing else.
  const bannerSrc = isSafeImageSource(bannerUrl) ? bannerUrl : undefined;
  return (
    <div className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      {bannerSrc && (
        <div className="mx-auto aspect-[3/1] max-h-64 w-full max-w-6xl overflow-hidden bg-[var(--osio-bg-subtle)]">
          <img src={bannerSrc} alt="" data-testid="profile-banner" className="h-full w-full object-cover" />
        </div>
      )}
      <div className={`mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-8 gap-y-6 px-4 pb-12 ${wideSidebar ? "md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : "md:grid-cols-[296px_minmax(0,1fr)]"} md:px-8`}>
        <aside aria-label="Profile details" data-overlaps-banner={bannerSrc ? "true" : undefined} className={`min-w-0 ${bannerSrc ? "-mt-16" : "pt-8"}`}>
          {sidebar}
        </aside>
        <div className="min-w-0 md:pt-8">{children}</div>
      </div>
    </div>
  );
};
