/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishResult.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the outbox learned from one PATCH /api/pages/:id. Pure, so the status mapping is
 * tested without the API client (which reads import.meta.env at load).
 *   "ok"      → written; advance the ledger. `ignored` lists the fields the bridge declined.
 *   "refused" → 403: the page exists but this viewer may not write it (read-only, revoked).
 *   "gone"    → 404: the page no longer exists server-side; forget it, keep the local copy.
 *   "failed"  → transient (offline / 5xx / 401 / 429 / no session); leave pending and retry.
 */
export type PublishResult = "ok" | "refused" | "gone" | "failed";

export function publishResultFor(status: number): PublishResult {
  if (status === 403) return "refused";
  if (status === 404) return "gone";
  return "failed";
}

/** The response body's `ignored` field list (string items only); anything else → []. */
export function ignoredFrom(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const raw = (body as { ignored?: unknown }).ignored;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}
