/* ************************************************************************** */
/*                                                                            */
/*   relativeTime.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/** "just now", "5m ago", "3h ago", "2d ago", "4w ago", "3mo ago", "2y ago".
 *  An unparseable, missing or non-positive value yields "" so callers can render their
 *  own dash: 0 stands for "never recorded" (a recent stored before visit times), not 1970. */
export function formatRelativeTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const then = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(then) || then <= 0) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
