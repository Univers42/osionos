/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableFormat.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { format as formatPattern } from "date-fns";

/** A resolved value before it becomes text, so filters can still re-format it. */
export type VariableValue =
  | { kind: "text"; text: string }
  | { kind: "number"; number: number }
  | { kind: "boolean"; flag: boolean }
  /** `dateOnly`: a calendar day (`2026-12-01`) built in host time — no zone applies to it. */
  | { kind: "date"; date: Date; dateOnly: boolean };

export interface FormatContext {
  locale: string;
  numberLocale: string;
  timeZone: string;
  now: Date;
}

const DATE_STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: { dateStyle: "short" },
  medium: { dateStyle: "medium" },
  long: { dateStyle: "long" },
  full: { dateStyle: "full" },
  time: { timeStyle: "short" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
};
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536e6], ["month", 2_592e6], ["week", 6_048e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3],
];
const DAY_MS = 864e5;

// Constructing an Intl formatter dwarfs formatting with one (tests/bench/variables.bench.ts),
// and keys are bounded by the formats in use, so this map stays small.
const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();
function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(key: string, build: () => T): T {
  let formatter = formatters.get(key) as T | undefined;
  if (!formatter) {
    formatter = build();
    formatters.set(key, formatter);
  }
  return formatter;
}

function dateTimeFormat(locale: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return cached(`d|${locale}|${timeZone}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone }));
}

/**
 * The wall clock of `date` in `timeZone`, as a host-local Date, so date-fns (which
 * only knows the host zone) prints the right digits.
 * Caveat: only the digits move — offset tokens (`x`, `X`, `O`) still print the HOST
 * offset, and a wall time that falls in the host's DST gap shifts by an hour. Use a
 * preset (`long`, `datetime`) when the zone must be exact.
 */
export function wallClock(date: Date, timeZone: string): Date {
  const parts = dateTimeFormat("en-US", timeZone, {
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** A calendar day `2026-12-01` is local midnight; anything else is an instant. */
export function dateValue(raw: string): VariableValue | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (day) return { kind: "date", date: new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])), dateOnly: true };
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : { kind: "date", date: new Date(time), dateOnly: false };
}

/** Caveat: rounds to the largest unit — 40 days away reads "next month". */
function relative(value: { date: Date; dateOnly: boolean }, context: FormatContext): string {
  const formatter = cached(`r|${context.locale}`, () => new Intl.RelativeTimeFormat(context.locale, { numeric: "auto" }));
  let diff = value.date.getTime() - context.now.getTime();
  if (value.dateOnly) {
    const clock = wallClock(context.now, context.timeZone);
    const today = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
    diff = Math.round((value.date.getTime() - today.getTime()) / DAY_MS) * DAY_MS;
  }
  const units = value.dateOnly ? RELATIVE_UNITS.slice(0, 4) : RELATIVE_UNITS;
  const [unit, ms] = units.find(([, size]) => Math.abs(diff) >= size) ?? units[units.length - 1];
  return formatter.format(Math.round(diff / ms), unit);
}

function formatDate(value: { date: Date; dateOnly: boolean }, pattern: string, context: FormatContext): string {
  const timeZone = value.dateOnly ? undefined : context.timeZone;
  if (pattern === "relative") return relative(value, context);
  const style = DATE_STYLES[pattern];
  if (style) return dateTimeFormat(context.locale, timeZone, style).format(value.date);
  const local = timeZone ? wallClock(value.date, timeZone) : value.date;
  if (pattern === "iso") return formatPattern(local, value.dateOnly ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm");
  // date-fns throws on an unescaped letter ("Invoice yyyy") — the resolver shows that as an error chip.
  return formatPattern(local, pattern);
}

function numberOptions(format: string): Intl.NumberFormatOptions {
  if (format === "decimal") return {};
  if (format === "integer") return { maximumFractionDigits: 0 };
  if (format === "percent") return { style: "percent", maximumFractionDigits: 2 };
  if (format === "compact") return { notation: "compact" };
  const [kind, arg = ""] = format.split(":");
  if (kind === "currency" && /^[A-Za-z]{3}$/.test(arg)) return { style: "currency", currency: arg.toUpperCase() };
  if (kind === "fixed" && /^(?:1?\d|20)$/.test(arg)) return { minimumFractionDigits: Number(arg), maximumFractionDigits: Number(arg) };
  throw new Error(`unknown number format "${format}" (decimal, integer, percent, compact, currency:EUR, fixed:2)`);
}

/** Throws a user-readable Error for a bad format; the resolver turns it into an error chip. */
export function formatVariableValue(value: VariableValue, format: string | undefined, context: FormatContext): string {
  if (value.kind === "text") return value.text;
  if (value.kind === "boolean") {
    const [yes, no] = (format ?? "true/false").split("/");
    return value.flag ? yes : (no ?? "");
  }
  if (value.kind === "number") {
    const key = `n|${context.numberLocale}|${format ?? "decimal"}`;
    return cached(key, () => new Intl.NumberFormat(context.numberLocale, numberOptions(format ?? "decimal"))).format(value.number);
  }
  return formatDate(value, format ?? "medium", context);
}
