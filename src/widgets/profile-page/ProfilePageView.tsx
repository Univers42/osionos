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
import { useUserStore } from "@/features/auth";
import { isProfessionId } from "@/data/professions/professions";
import { professionProfileContent } from "@/data/professions/professionProfiles";
import { useProfessionStore } from "@/features/professions/model/useProfessionStore";
import { usePresenceHeartbeat } from "@/shared/people/usePresenceHeartbeat";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { useTemplateForSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";
import { ProfileView } from "./ProfileView";
import { ProfileActions } from "./profileChrome";
import { ReadmeBlocks } from "./ReadmeBlocks";
import { BindingProvider, toBoundRecord, toReadmeRecord } from "./model/binding";
import { useProfile } from "./useProfile";

export const ProfilePageView: React.FC<{ userId: string }> = ({ userId }) => {
  const { profile } = useProfile(userId);
  const activeUserId = useUserStore((state) => state.activeUserId);
  const storeProfession = useProfessionStore((state) => state.profession);
  // The subject's profession is the server's when it carries one; for the member
  // viewing their own page the persisted pick covers the offline build, where
  // the server card is unreachable.
  const profileProfession = (profile as { profession?: unknown } | null)?.profession;
  const subjectProfession = isProfessionId(profileProfession)
    ? profileProfession
    : userId === activeUserId && isProfessionId(storeProfession)
      ? storeProfession
      : null;
  const professionBlocks = subjectProfession ? professionProfileContent(subjectProfession) : null;
  const templateBlocks = useTemplateForSurface("profile");
  const record = useMemo(() => toBoundRecord(profile), [profile]);
  const readmeRecord = useMemo(() => toReadmeRecord(profile), [profile]);
  usePresenceHeartbeat();

  // A member's own pick wins over the admin's global template: it is the
  // opt-in, and it is not gated on osio.profile.template.
  if (professionBlocks) {
    return (
      <div className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <ProfileActions userId={userId} name={profile?.name ?? ""} />
          <button
            type="button"
            data-testid="profession-repick"
            onClick={() => useProfessionStore.getState().setOpen(true)}
            className="mb-4 rounded-md border border-[var(--osio-border-default)] px-3 py-1 text-sm text-[var(--osio-fg-muted)]"
          >
            Change profession
          </button>
          <BindingProvider record={record}>
            <PageBlocksRenderer blocks={professionBlocks} />
          </BindingProvider>
          <ReadmeBlocks readme={profile?.readme} record={readmeRecord} />
        </div>
      </div>
    );
  }

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
        <ReadmeBlocks readme={profile?.readme} record={readmeRecord} />
      </div>
    </div>
  );
};
