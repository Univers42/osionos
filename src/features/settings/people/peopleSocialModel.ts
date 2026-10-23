/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleSocialModel.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The pure half of follow, presence and status: what the UI decides before and after a
 * request. No React and no client here, so the rules are tested alone (the follow
 * toggle's optimism, the status limits, the presence wording).
 *
 * The limits mirror scripts/bridge-status.mjs and scripts/bridge-presence.mjs; the bridge
 * stays the authority, this only refuses early what it would refuse with a 422.
 *
 * Caveat: the limits are copied, not shared, so a change on the bridge side must be made
 * here too. A drift only shows as a 422 that the editor then reports in plain words.
 */

export const STATUS_EMOJI_LIMIT = 8;
export const STATUS_TEXT_LIMIT = 120;
export const PRESENCE_TEXT_LIMIT = 120;

export const PRESENCE_CHOICES = ["online", "away", "dnd", "invisible"] as const;
export type PresenceChoice = (typeof PRESENCE_CHOICES)[number];
/** What a card can show: a choice another person may see, or "offline". */
export type PresenceState = PresenceChoice | "offline";

const PRESENCE_LABELS: Record<PresenceState, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  invisible: "Invisible",
  offline: "Offline",
};

export function presenceLabel(state: string | null | undefined): string {
  return PRESENCE_LABELS[state as PresenceState] ?? PRESENCE_LABELS.offline;
}

export function isPresenceChoice(value: unknown): value is PresenceChoice {
  return PRESENCE_CHOICES.includes(value as PresenceChoice);
}

// --- follow ----------------------------------------------------------------

export interface FollowView {
  following: boolean;
  followerCount: number;
  followingCount: number;
}

export interface FollowCalls {
  follow: () => Promise<unknown>;
  unfollow: () => Promise<unknown>;
}

export interface FollowOutcome {
  view: FollowView;
  failed: boolean;
}

/** The view the person expects the moment they press the button. */
export function optimisticFollow(view: FollowView): FollowView {
  const following = !view.following;
  return { ...view, following, followerCount: Math.max(0, view.followerCount + (following ? 1 : -1)) };
}

/**
 * Shows the flipped state at once through `show`, then confirms it with the request.
 * A refused request puts the previous view back, so the button never lies about a
 * follow the server does not hold.
 */
export async function toggleFollow(view: FollowView, calls: FollowCalls, show: (next: FollowView) => void): Promise<FollowOutcome> {
  const next = optimisticFollow(view);
  show(next);
  try {
    await (next.following ? calls.follow() : calls.unfollow());
    return { view: next, failed: false };
  } catch {
    show(view);
    return { view, failed: true };
  }
}

// --- status ----------------------------------------------------------------

export interface StatusDraft {
  emoji: string;
  text: string;
  /** An ISO date-time, or "" for a status that does not expire. */
  expiresAt: string;
  busy: boolean;
}

export type StatusCheck =
  | { ok: true; body: { emoji: string | null; text: string | null; expiresAt: string | null; busy: boolean } }
  | { ok: false; field: "emoji" | "text" | "expiresAt"; message: string };

// The bridge strips the same ranges (bridge-status.mjs): C0 controls except tab and newline.
const isControl = (code: number) => code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
const clean = (value: string) => Array.from(value).filter((char) => !isControl(char.codePointAt(0) ?? 0)).join("").trim();
const tooLong = (value: string, limit: number) => Array.from(value).length > limit;

export function validateStatus(draft: StatusDraft, nowMs: number): StatusCheck {
  const emoji = clean(draft.emoji);
  const text = clean(draft.text);
  if (tooLong(emoji, STATUS_EMOJI_LIMIT)) return { ok: false, field: "emoji", message: `The emoji can be at most ${STATUS_EMOJI_LIMIT} characters.` };
  if (tooLong(text, STATUS_TEXT_LIMIT)) return { ok: false, field: "text", message: `The status can be at most ${STATUS_TEXT_LIMIT} characters.` };
  let expiresAt: string | null = null;
  if (draft.expiresAt) {
    const at = Date.parse(draft.expiresAt);
    if (!Number.isFinite(at) || at <= nowMs) return { ok: false, field: "expiresAt", message: "Choose a time in the future, or leave it empty." };
    expiresAt = new Date(at).toISOString();
  }
  return { ok: true, body: { emoji: emoji || null, text: text || null, expiresAt, busy: draft.busy } };
}

/** The note the heartbeat carries: null clears it, a too-long one is refused. */
export function checkPresenceText(text: string): { ok: true; text: string | null } | { ok: false; message: string } {
  const trimmed = clean(text);
  if (tooLong(trimmed, PRESENCE_TEXT_LIMIT)) return { ok: false, message: `The note can be at most ${PRESENCE_TEXT_LIMIT} characters.` };
  return { ok: true, text: trimmed || null };
}
