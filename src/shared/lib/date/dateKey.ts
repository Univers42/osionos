/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dateKey.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The `YYYY-MM-DD` calendar key every date surface in the app compares, renders
 * and feeds to `<input type="date">`.
 *
 * It exists because the wire does NOT honour the declared contract: `block.dueAt`
 * is documented as `YYYY-MM-DD` (entities/block/model/types.ts) but the column
 * behind it — `osionos_tasks.due_at` — is `timestamp with time zone`, so the
 * bridge hands back a full timestamp ("2026-09-19T08:54:05.240944+00:00").
 * `<input type="date">` REJECTS that shape outright (blank field + a console
 * warning per render), `new Date(`${dueAt}T00:00:00`)` becomes Invalid Date, and
 * an overdue check comparing it against a date key is a string compare across
 * two different formats.
 */

/** Today, as a LOCAL calendar key — a due date is "today" in the user's zone. */
export function todayKey(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Narrows a stored date value to its calendar key; `''` when there is none.
 *
 * A value that already leads with the date is SLICED rather than re-parsed: a
 * date stored at midnight UTC slips a day backwards through a local-time `Date`
 * for anyone west of Greenwich, which would silently mark today's task overdue.
 */
export function toDateKey(value: string | null | undefined): string {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}
