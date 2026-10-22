/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishedPagesApi.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client half of the Published pages panel: the one bridge call that
 * lists the caller's own published pages, and the three states the panel
 * draws from it (a list, a disabled publish feature, an error).
 *
 * The route is the account plane's (P5-5-b): it needs the PAGE JWT, because a
 * bridge session's session JWT is deliberately blank.
 */

import { ApiError, api, getActivePageJwt } from "@/shared/api/client";
import { errorMessage, parsePublishedPages, type PublishedPage } from "./publishedPages";

export type PublishedPagesOutcome =
  /** The list came back; it may be empty. */
  | { kind: "pages"; pages: PublishedPage[] }
  /** The bridge runs without the publish feature (404 publish_disabled). */
  | { kind: "disabled" }
  /** Anything else: the panel shows the bridge's message, muted. */
  | { kind: "error"; message: string };

/**
 * The whole publish feature answers 404 when the bridge runs without it. That
 * is a state, not a failure: the panel says so instead of showing an error.
 */
function isPublishDisabled(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false;
  if (error.code === "publish_disabled") return true;
  return /publish/i.test(error.message) && /disabled/i.test(error.message);
}

/** The caller's own published pages, with the status of each snapshot. */
export async function fetchPublishedPages(): Promise<PublishedPagesOutcome> {
  try {
    const body = await api.get<{ ok: true; pages: PublishedPage[] }>(
      "/api/account/published-pages",
      getActivePageJwt() ?? undefined,
    );
    return { kind: "pages", pages: parsePublishedPages(body) };
  } catch (error) {
    if (isPublishDisabled(error)) return { kind: "disabled" };
    return { kind: "error", message: errorMessage(error) };
  }
}
