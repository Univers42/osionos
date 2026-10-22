/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sentimentPulse.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sentiment surfaces of the app, as PURE functions: the answers of the
 * service are parsed and checked here, and the words and the chart rows are
 * made here. No fetch, no clock, no state.
 *
 * A WEEK WITHOUT NUMBERS IS A GAP. The service leaves out a week with fewer than
 * five people behind it (C140); the chart shows that as an empty row, never as a
 * zero — zero would say "nobody was negative" where the truth is "too few
 * people to say".
 */

export type SentimentLabel = "negative" | "neutral" | "positive";
const LABELS: readonly SentimentLabel[] = ["negative", "neutral", "positive"];

export interface PulseWeek {
  weekStart: string;
  negative: number;
  neutral: number;
  positive: number;
}

export interface Pulse {
  enabled: boolean;
  minAuthors: number;
  weeks: PulseWeek[];
}

export interface ThreadMood {
  mood: SentimentLabel;
  /** 0..1, the part of the scored comments that carry the majority label. */
  share: number;
}

/** One row of the chart: the counts of a week, or null on all three for a gap. */
export interface PulseRow {
  weekStart: string;
  negative: number | null;
  neutral: number | null;
  positive: number | null;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

const isLabel = (value: unknown): value is SentimentLabel => LABELS.includes(value as SentimentLabel);

/** The settings answer: `{ enabled }`, or null when it is not that. */
export function parseSettings(raw: unknown): { enabled: boolean } | null {
  const enabled = (raw as { enabled?: unknown } | null)?.enabled;
  return typeof enabled === "boolean" ? { enabled } : null;
}

/** The Pulse answer, or null when any part of it is not what the contract says. */
export function parsePulse(raw: unknown): Pulse | null {
  const body = raw as { enabled?: unknown; minAuthors?: unknown; weeks?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean" || !Array.isArray(body.weeks)) return null;
  if (!body.enabled) return { enabled: false, minAuthors: 0, weeks: [] };
  if (!isCount(body.minAuthors)) return null;
  const weeks: PulseWeek[] = [];
  for (const entry of body.weeks as Array<Partial<PulseWeek>>) {
    if (!entry || typeof entry.weekStart !== "string" || !DAY.test(entry.weekStart)) return null;
    if (!isCount(entry.negative) || !isCount(entry.neutral) || !isCount(entry.positive)) return null;
    weeks.push({ weekStart: entry.weekStart, negative: entry.negative, neutral: entry.neutral, positive: entry.positive });
  }
  return { enabled: true, minAuthors: body.minAuthors, weeks };
}

/** The mood answer: the mood, or null for `{ mood: null }` and for anything malformed. */
export function parseThreadMood(raw: unknown): ThreadMood | null {
  const body = raw as { mood?: unknown; share?: unknown } | null;
  if (!body || !isLabel(body.mood)) return null;
  if (typeof body.share !== "number" || !(body.share >= 0 && body.share <= 1)) return null;
  return { mood: body.mood, share: body.share };
}

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The rows of the chart, oldest first. A week between two answered weeks that the
 * service left out is a gap row.
 *
 * Caveat: only the gaps INSIDE the answered range are shown — the weeks before the
 * first and after the last answered one are not, because the client has no clock
 * to say how far the window reaches.
 */
export function pulseRows(weeks: readonly PulseWeek[]): PulseRow[] {
  const sorted = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const rows: PulseRow[] = [];
  for (const week of sorted) {
    const previous = rows.at(-1);
    if (previous) {
      for (let at = dayMs(previous.weekStart) + WEEK_MS; at < dayMs(week.weekStart); at += WEEK_MS) {
        rows.push({ weekStart: dayOf(at), negative: null, neutral: null, positive: null });
      }
    }
    rows.push({ ...week });
  }
  return rows;
}

const MOOD_WORDS: Record<SentimentLabel, string> = {
  negative: "Mostly negative",
  neutral: "Mostly neutral",
  positive: "Mostly positive",
};

const percent = (share: number): number => Math.round(share * 100);

/** "Mostly positive · 72 %" */
export function formatMood(mood: ThreadMood): string {
  return `${MOOD_WORDS[mood.mood]} · ${percent(mood.share)} %`;
}

/** "Thread mood: Mostly positive (72 %)" — the line on top of a comment thread. */
export function threadMoodLine(mood: ThreadMood): string {
  return `Thread mood: ${MOOD_WORDS[mood.mood]} (${percent(mood.share)} %)`;
}
