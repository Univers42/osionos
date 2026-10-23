/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderationModel.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pure half of the Interaction limits panel: the vocabulary, the words, and
 * how a bridge body is read. Nothing here touches the network, the DOM or the
 * clock, so the canvas runner proves all of it.
 *
 * The vocabulary is a copy of scripts/bridge-moderation-core.mjs; a canvas test
 * compares the two, so a drift fails instead of warning.
 */

export const INTERACTIONS = ["messages", "connections", "comments"] as const;
export type Interaction = (typeof INTERACTIONS)[number];

export const MODES: Record<Interaction, readonly string[]> = {
  messages: ["everyone", "connections", "nobody"],
  connections: ["everyone", "nobody"],
  comments: ["everyone", "workspace", "nobody"],
};
export const DURATION_HOURS = [24, 168, 720, 2160, 4320] as const;

export interface Limit {
  mode: string;
  until?: string;
}
export type Limits = Record<Interaction, Limit>;

const MODE_WORDS: Record<string, string> = {
  everyone: "Everyone",
  connections: "People you are connected to",
  workspace: "People in the workspace",
  nobody: "Nobody",
};

const DURATION_WORDS: Record<number, string> = {
  24: "24 hours",
  168: "7 days",
  720: "30 days",
  2160: "90 days",
  4320: "6 months",
};

/** A mode outside the interaction's vocabulary reads as the default, never as a made-up word. */
export function modeLabel(interaction: Interaction, mode: string): string {
  return MODES[interaction].includes(mode) ? MODE_WORDS[mode] : MODE_WORDS.everyone;
}

export function durationLabel(hours: number): string {
  return DURATION_WORDS[hours] ?? `${hours} hours`;
}

/**
 * "Until 23 Oct 2026", or "No limit" for an absent, malformed or past `until`
 * (the bridge reads those as no limit too).
 * Caveat: the date is shown in UTC so it is the same on every machine; near
 * midnight it can differ by one day from the viewer's local calendar.
 */
export function expiryLabel(until: unknown, now: number): string {
  const time = typeof until === "string" ? Date.parse(until) : Number.NaN;
  if (!(time > now)) return "No limit";
  const day = new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `Until ${day}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLimit(interaction: Interaction, stored: unknown, now: number): Limit {
  if (!isObject(stored) || typeof stored.mode !== "string") return { mode: "everyone" };
  if (!MODES[interaction].includes(stored.mode) || stored.mode === "everyone") return { mode: "everyone" };
  const until = typeof stored.until === "string" ? Date.parse(stored.until) : Number.NaN;
  return until > now ? { mode: stored.mode, until: stored.until as string } : { mode: "everyone" };
}

/** The three interactions with their effective values; every field that is not provable is the default. */
export function parseModeration(body: unknown, now: number): Limits {
  const source = isObject(body) ? body : {};
  return {
    messages: readLimit("messages", source.messages, now),
    connections: readLimit("connections", source.connections, now),
    comments: readLimit("comments", source.comments, now),
  };
}

/** The audit trail carries what was limited, never when it ends. */
export function auditMetadata(interaction: Interaction, mode: string): Record<string, unknown> {
  return { interaction, mode };
}
