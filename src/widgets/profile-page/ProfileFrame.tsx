/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileFrame.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shell + sidebar for one member's page, shared by the default view and the profession
 * branch. The owner's Edit profile (and each empty-section prompt) swaps the sidebar for the
 * shared edit form in place; leaving it puts focus back on the Edit button.
 */

import React, { useEffect, useRef, useState } from "react";

import { useUserStore } from "@/features/auth";
import { PublicProfileEditor } from "@/features/settings/profile/PublicProfileEditor";
import { UsernameModal } from "@/features/settings/profile/ProfileSecurityModals";
import { ProfileShell } from "./ProfileShell";
import { ProfileSidebar } from "./ProfileSidebar";
import { activeStatus } from "./model/profileStatus";
import type { MemberProfile } from "./useProfile";

interface ProfileFrameProps {
  userId: string;
  profile: MemberProfile | null;
  /** Re-reads the page's profile after a save, a photo change or a username change. */
  onSaved?: () => void;
  children: React.ReactNode;
}

interface Editing {
  field?: string;
}

function useEditFocusReturn(editing: Editing | null): void {
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) document.querySelector<HTMLElement>("[data-profile-edit]")?.focus();
    wasEditing.current = editing !== null;
  }, [editing]);
}

export const ProfileFrame: React.FC<ProfileFrameProps> = ({ userId, profile, onSaved, children }) => {
  const isOwner = useUserStore((s) => s.activeUserId) === userId;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [changingUsername, setChangingUsername] = useState(false);
  useEditFocusReturn(editing);

  const leave = () => { setEditing(null); onSaved?.(); };
  const stored = profile && activeStatus(profile.status, new Date()) ? profile.status ?? null : null;

  const sidebar = profile && (editing && isOwner ? (
    <>
      <PublicProfileEditor
        saveLabel="Save"
        discardLabel="Cancel"
        discardAlways
        status={stored}
        focusField={editing.field ?? "displayName"}
        onChangeUsername={() => setChangingUsername(true)}
        onDone={leave}
      />
      {changingUsername && profile.username && (
        <UsernameModal current={profile.username} onClose={() => { setChangingUsername(false); onSaved?.(); }} />
      )}
    </>
  ) : (
    <ProfileSidebar userId={userId} profile={profile} isOwner={isOwner} onEdit={() => setEditing({})} onAdd={(field) => setEditing({ field })} />
  ));
  return <ProfileShell bannerUrl={profile?.bannerUrl} sidebar={sidebar} wideSidebar={Boolean(editing && isOwner)}>{children}</ProfileShell>;
};
