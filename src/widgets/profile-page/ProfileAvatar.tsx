/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileAvatar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The identity mark of the profile page: the large avatar, the presence dot and, when the
 * person has a status emoji, that emoji on the avatar's corner.
 */

import React from "react";

import { Avatar } from "@/shared/ui";

import { isSafeImageSource } from "@/shared/lib/media/bridgeMediaUrl";
import type { ShownStatus } from "./model/profileStatus";

interface ProfileAvatarProps {
  name: string;
  /** The card's avatar first, the legacy route's second; an unsafe URL is not drawn. */
  sources: Array<string | null | undefined>;
  online: boolean;
  status: ShownStatus | null;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ name, sources, online, status }) => {
  const src = sources.find((candidate): candidate is string => isSafeImageSource(candidate));
  return (
    <div className="relative inline-block rounded-full border-4 border-[var(--osio-bg-page)] bg-[var(--osio-bg-page)]">
      <Avatar name={name} src={src} size="xl" />
      <span
        title={online ? "Online" : "Offline"}
        className={`absolute right-1 top-1 h-4 w-4 rounded-full border-2 border-[var(--osio-bg-page)] ${online ? "bg-[var(--osio-success)]" : "bg-[var(--osio-fg-subtle)]"}`}
      />
      {status?.emoji && (
        <span
          data-testid="profile-status-emoji"
          className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-xl"
        >
          <span aria-hidden="true">{status.emoji}</span>
        </span>
      )}
    </div>
  );
};
