/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   binding.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { BoundRecordProvider, type BoundRecord } from "@/entities/block/model/binding";
import type { MemberProfile } from "../useProfile";

/** Map the bridge MemberProfile → the generic record the template binds against. */
export function toBoundRecord(profile: MemberProfile | null): BoundRecord | null {
  if (!profile) return null;
  return {
    id: profile.userId,
    displayName: profile.name,
    name: profile.name,
    username: profile.username ?? null,
    avatar: profile.avatar,
    role: profile.role,
    headline: profile.headline ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    joinedAt: profile.joinedAt ?? null,
    online: profile.online,
    lastSeenAt: profile.lastSeenAt,
    customFields: profile.customFields ?? {},
  };
}

/**
 * Provides an adapted record (any surface — a user's member row, a marketplace
 * app, …) to the bound template blocks. Record-agnostic so the same provider
 * serves every admin-authored shell; callers pass a `BoundRecord` they adapted
 * from their surface's data (e.g. `toBoundRecord(profile)`).
 */
export function BindingProvider({ record, children }: { record: BoundRecord | null; children: React.ReactNode }): React.ReactElement {
  const stable = useMemo(() => record, [record]);
  return <BoundRecordProvider value={stable}>{children}</BoundRecordProvider>;
}
