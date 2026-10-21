/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sharedSpaceGate.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 10:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/21 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Which space (if any) the presence bar joins — extracted as a pure function so
 * the JOIN decision is testable without React or stores (AOC §6). Measured bug:
 * the bar only joined spaces listed in `activeSession().sharedWorkspaces`
 * (spaces JOINED, not OWNED), so the owner of a private workspace never
 * appeared in their own roster, while Notion lists the owner too. The bridge
 * already mints the owner a space token (`scripts/bridge-collab.mjs`
 * `requireSpaceMembership` returns for `owner_id`), so an OWNED workspace with
 * at least one OTHER member is a live space the owner may join; owned and
 * empty, it would join an empty room — pointless TRACK traffic, so it stays
 * null. Everything arrives as plain values: no store, no API in here.
 */

/** Plain-value inputs to the shared-space join decision. */
export interface SharedSpaceGateInput {
  /** The `osio.collab.shared` flag state — nothing joins while it is OFF. */
  flagEnabled: boolean;
  /** The active workspace id, or '' / null when no workspace is active. */
  activeWorkspaceId: string | null;
  /** Ids of the workspaces the caller JOINED (not owns) in this session. */
  sharedWorkspaceIds: readonly string[];
  /** Whether the caller owns the active workspace (`ownerId === self`). */
  ownedBySelf: boolean;
  /** Members of the active workspace OTHER than the caller (owned only). */
  otherMemberCount: number;
}

/**
 * The space to join: the active workspace when the flag is ON AND either the
 * caller joined it (shared with me) or owns it with at least one other member
 * inside; else null — the bar then renders nothing and connects nowhere.
 */
export function sharedSpaceIdFor(input: SharedSpaceGateInput): string | null {
  if (!input.flagEnabled || !input.activeWorkspaceId) return null;
  const joinedByMe = input.sharedWorkspaceIds.includes(input.activeWorkspaceId);
  const ownedWithOthers = input.ownedBySelf && input.otherMemberCount >= 1;
  return joinedByMe || ownedWithOthers ? input.activeWorkspaceId : null;
}
