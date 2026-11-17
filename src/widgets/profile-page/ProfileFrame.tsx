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
 * branch so the identity column is written once. The empty-section prompts route to
 * Settings until the page edits in place.
 */

import React from "react";

import { useUserStore } from "@/features/auth";
import { openSettings } from "@/features/settings/model/settingsNav";
import { ProfileShell } from "./ProfileShell";
import { ProfileSidebar } from "./ProfileSidebar";
import type { MemberProfile } from "./useProfile";

interface ProfileFrameProps {
  userId: string;
  profile: MemberProfile | null;
  children: React.ReactNode;
}

export const ProfileFrame: React.FC<ProfileFrameProps> = ({ userId, profile, children }) => {
  const isOwner = useUserStore((s) => s.activeUserId) === userId;
  const sidebar = profile && (
    <ProfileSidebar userId={userId} profile={profile} isOwner={isOwner} onAdd={() => openSettings("profile", "public-profile")} />
  );
  return <ProfileShell bannerUrl={profile?.bannerUrl} sidebar={sidebar}>{children}</ProfileShell>;
};
