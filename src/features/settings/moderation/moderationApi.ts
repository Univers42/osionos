/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderationApi.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client half of the Interaction limits panel: the two bridge calls (read
 * and save) and the three outcomes the panel draws from them.
 *
 * The route is the account plane's (P5-4-b): it needs the PAGE JWT, because a
 * bridge session's session JWT is deliberately blank.
 */

import { ApiError, api, getActivePageJwt } from "@/shared/api/client";
import { parseModeration, type Interaction, type Limits } from "./moderationModel";

const ROUTE = "/api/account/moderation-settings";

export type ModerationOutcome =
  | { kind: "limits"; limits: Limits; at: number }
  /** A bridge without the moderation route answers a bare 404: a state, not a failure. */
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

function failure(error: unknown): ModerationOutcome {
  // Any 404, with or without a `code`: a bridge without the route has no code to give.
  if (error instanceof ApiError && error.status === 404) return { kind: "unsupported" };
  const message = error instanceof Error && error.message ? error.message : "The interaction limits could not be loaded.";
  return { kind: "error", message };
}

export async function fetchModeration(): Promise<ModerationOutcome> {
  try {
    const body = await api.get<unknown>(ROUTE, getActivePageJwt() ?? undefined);
    const at = Date.now();
    return { kind: "limits", limits: parseModeration(body, at), at };
  } catch (error) {
    return failure(error);
  }
}

export async function saveModeration(
  interaction: Interaction,
  request: { mode: string; durationHours: number },
): Promise<ModerationOutcome> {
  try {
    const body = await api.patch<unknown>(ROUTE, { [interaction]: request }, getActivePageJwt() ?? undefined);
    const at = Date.now();
    return { kind: "limits", limits: parseModeration(body, at), at };
  } catch (error) {
    return failure(error);
  }
}
