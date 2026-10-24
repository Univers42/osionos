/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePersonSocial.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/** Loads one person's presence, status and follow counts for a card, and runs the
 *  follow toggle. Offline (no bridge or no session) it loads nothing and reports
 *  `available: false`, so a card shows only what the row already knows. */

import { useCallback, useEffect, useState } from "react";
import { fetchFollowCounts, fetchPersonCard, followUser, socialAvailable, unfollowUser, type PersonCard } from "@/shared/social/followApi";
import { toggleFollow, type FollowView } from "./peopleSocialModel";

export interface PersonSocial {
  available: boolean;
  loading: boolean;
  card: PersonCard | null;
  follow: FollowView | null;
  notice: string | null;
  toggle: () => void;
}

export function usePersonSocial(personId: string | null, enabled: boolean): PersonSocial {
  const available = enabled && personId !== null && socialAvailable();
  const [state, setState] = useState<{ id: string | null; card: PersonCard | null; follow: FollowView | null }>({ id: null, card: null, follow: null });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!available || !personId) return;
    let live = true;
    Promise.all([fetchFollowCounts(personId), fetchPersonCard(personId)])
      .then(([counts, card]) => {
        if (!live) return;
        const follow = counts && { following: counts.viewerFollows, followerCount: counts.followerCount, followingCount: counts.followingCount };
        setState({ id: personId, card, follow });
      })
      .catch(() => { if (live) setState({ id: personId, card: null, follow: null }); });
    return () => { live = false; };
  }, [available, personId]);

  const toggle = useCallback(() => {
    if (!personId || !state.follow) return;
    setNotice(null);
    void toggleFollow(state.follow, { follow: () => followUser(personId), unfollow: () => unfollowUser(personId) },
      (next) => setState((prev) => ({ ...prev, follow: next })))
      .then((outcome) => { if (outcome.failed) setNotice("Could not update the follow. Try again."); });
  }, [personId, state.follow]);

  return { available, loading: available && state.id !== personId, card: state.card, follow: state.follow, notice, toggle };
}
