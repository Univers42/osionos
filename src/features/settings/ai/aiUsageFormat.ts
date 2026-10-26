/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiUsageFormat.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The usage meter, in the reader's own money.
 *
 * The service counts in micro dollars — a millionth of a dollar. "0.00 of
 * 0.20" is a number, not a price: a meter has to read like money. "$0.00 of
 * $0.20" in en-US, and the reader's own currency and separators everywhere
 * else.
 */

/** A dollar is a million micro dollars. */
const MICRO_PER_DOLLAR = 1_000_000;

/**
 * The formatters, one per locale.
 *
 * Building an Intl formatter is one of the pricier built-ins; the panel
 * re-renders on every poll, so the instances are kept.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale?: string): Intl.NumberFormat {
  const key = locale ?? "";
  const known = formatters.get(key);
  if (known) return known;
  const made = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });
  formatters.set(key, made);
  return made;
}

/** A cent: below it a real spend reads "< $0.01" instead of a misleading "$0.00". */
const CENT_MICRO = 10_000;

/** Micro dollars, as money. The reader's locale unless another one is asked for. */
export function formatMicroUsd(microUsd: number, locale?: string): string {
  const format = formatterFor(locale);
  if (microUsd > 0 && microUsd < CENT_MICRO) return `< ${format.format(CENT_MICRO / MICRO_PER_DOLLAR)}`;
  return format.format(microUsd / MICRO_PER_DOLLAR);
}

/** The meter: what the day has cost, of what the day allows. */
export function formatUsage(spentMicroUsd: number, limitMicroUsd: number, locale?: string): string {
  return `${formatMicroUsd(spentMicroUsd, locale)} of ${formatMicroUsd(limitMicroUsd, locale)}`;
}
