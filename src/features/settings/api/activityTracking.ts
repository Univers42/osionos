/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   activityTracking.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the `activity_tracking` preference: the user's opt-in to the activity log that
 * feeds their own Insights and the admins' k>=5 aggregates. It lives in the `preferences`
 * section of /api/preferences, beside the other switches, and is separate from the
 * recommender's beacon consent (personalization.ts).
 *
 * A missing key means OFF. A failed call is an error with the server's message, never a
 * silent success, so the switch can go back to where the server has it.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

const ROUTE = "/api/preferences";

export type ActivityTrackingResult = { ok: true; enabled: boolean } | { ok: false; message: string };

const failure = (error: unknown): ActivityTrackingResult => ({
  ok: false,
  message: error instanceof Error && error.message ? error.message : "The request failed.",
});

const isOn = (body: unknown): boolean =>
  typeof body === "object" && body !== null && (body as Record<string, unknown>).activity_tracking === true;

export async function readActivityTracking(): Promise<ActivityTrackingResult> {
  try {
    return { ok: true, enabled: isOn(await api.get<unknown>(ROUTE, getActivePageJwt() ?? undefined)) };
  } catch (error) {
    return failure(error);
  }
}

/** Sends only this one key, so every other preference keeps its value. A 2xx is the
 *  confirmation: the reply body is not trusted to echo the key. */
export async function writeActivityTracking(enabled: boolean): Promise<ActivityTrackingResult> {
  try {
    await api.patch<unknown>(ROUTE, { activity_tracking: enabled }, getActivePageJwt() ?? undefined);
    return { ok: true, enabled };
  } catch (error) {
    return failure(error);
  }
}
