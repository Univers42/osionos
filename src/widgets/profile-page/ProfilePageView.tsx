/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfilePageView.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Admin-authored, data-bound profile page. Renders the admin's profile TEMPLATE
 * (a /canvas page built with the app's own block tools) bound to the viewed
 * user's record, fully read-only. Falls back to the built-in ProfileView when
 * the feature flag is off or no template exists — so it is always non-breaking.
 */

import React, { useMemo } from "react";

import { isProfileTemplateEnabled } from "@/shared/config/featureFlags";
import { usePresenceHeartbeat } from "@/shared/people/usePresenceHeartbeat";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { useTemplateForSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";
import { ProfileView } from "./ProfileView";
import { ProfileActions } from "./profileChrome";
import { BindingProvider, toBoundRecord } from "./model/binding";
import { useProfile } from "./useProfile";

export const ProfilePageView: React.FC<{ userId: string }> = ({ userId }) => {
  const { profile } = useProfile(userId);
  const templateBlocks = useTemplateForSurface("profile");
  const record = useMemo(() => toBoundRecord(profile), [profile]);
  usePresenceHeartbeat();

  // Off, or no admin template yet → the built-in profile (unchanged behaviour).
  if (!isProfileTemplateEnabled() || templateBlocks === null) {
    return <ProfileView userId={userId} />;
  }

  return (
    <div className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ProfileActions userId={userId} name={profile?.name ?? ""} />
        <BindingProvider record={record}>
          <PageBlocksRenderer blocks={templateBlocks} />
        </BindingProvider>
      </div>
    </div>
  );
};
