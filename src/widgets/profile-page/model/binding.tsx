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
import { BoundRecordProvider, README_FIELDS, type BoundRecord } from "@/entities/block/model/binding";
import { PROFESSIONS } from "@/data/professions/professions";
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

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * The record a user-authored README resolves against: an explicit copy of the
 * README_FIELDS keys, never a spread, so a private field cannot ride along whatever
 * `fieldBind` says. The profession id is shown as its label; an unknown id stays as is.
 */
export function toReadmeRecord(profile: MemberProfile | null): BoundRecord | null {
  if (!profile) return null;
  const source: Record<string, unknown> = { ...profile, displayName: profile.name };
  const record: BoundRecord = { id: profile.userId };
  for (const { key } of README_FIELDS) {
    const value = Object.hasOwn(source, key) ? source[key] : undefined;
    if (isEmptyValue(value)) continue;
    record[key] = key === "profession" ? (PROFESSIONS.find((item) => item.id === value)?.label ?? value) : value;
  }
  return record;
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
