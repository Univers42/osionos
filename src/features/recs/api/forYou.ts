/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   forYou.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the "For you" routes: the slate the recommender serves to the
 * user, and the refusal of one of its pages.
 *
 * The call rides the app's authenticated helper — `api` from @/shared/api/client
 * with the session JWT — like every other call. With no API configured (an
 * offline build) every function answers "not available": never a fake slate,
 * so the strip can stay invisible instead of pretending.
 *
 * The refusal carries the SLATE and the PAGE, and nothing else: the bridge
 * decides whose row it is, and refuses a page that was not in a slate it
 * issued to this user (C49).
 */

import { API_BASE, api, getActiveJwt } from "@/shared/api/client";

/** Why a page is in the slate. */
export type ForYouWhy =
  | {
      kind: "because";
      pageId: string;
      title: string | null;
      event: "liked" | "commented" | "shared" | "saved";
    }
  | { kind: "for_you" }
  // The non-personalised order, served when "For you" cannot personalise (C48).
  | { kind: "popular" };

/** One page of the slate, with the reason it is there. */
export interface ForYouItem {
  pageId: string;
  title: string | null;
  icon: string | null;
  workspaceId: string | null;
  rank: number;
  why: ForYouWhy;
}

/** The 200 answer of the route: a slate, or the reason there is none. */
export interface ForYou {
  ok: boolean;
  personalized: boolean;
  modelId?: number;
  recId?: string;
  slate?: string;
  reason?: string;
  items: ForYouItem[];
}

/** The answer of a call: the value, or why there is none. */
export type ForYouResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "unavailable" | "failed"; message: string };

/**
 * The bridge the calls ride. The default is the app's own helper; the tests
 * replace it whole, so a request can be read before it is sent.
 */
export interface ForYouBridge {
  /** The bridge base URL. Empty = no API configured. */
  baseUrl: string;
  /** The session bearer, or null when there is no session. */
  jwt: () => string | null;
  /** The call itself: method, path and body. */
  call: <T>(method: "GET" | "POST", path: string, body?: unknown) => Promise<T>;
}

/** The bridge of the app: the authenticated helper, with the session JWT. */
export const appForYouBridge: ForYouBridge = {
  baseUrl: API_BASE,
  jwt: getActiveJwt,
  call: <T>(method: "GET" | "POST", path: string, body?: unknown) => {
    const jwt = getActiveJwt() ?? undefined;
    if (method === "GET") return api.get<T>(path, jwt);
    return api.post<T>(path, body, jwt);
  },
};

let bridge: ForYouBridge = appForYouBridge;

/** Replaces the bridge. The tests use it; the app never calls it. */
export function setForYouBridge(next: ForYouBridge): void {
  bridge = next;
}

const UNAVAILABLE = "The recommendations are not available in this build.";
const SIGNED_OUT = "Sign in to see what is recommended for you.";

/** The status an error carries, or 0 when it carries none. */
function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : 0;
}

/** One call, and the two ways it can fail without pretending it worked. */
async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ForYouResult<T>> {
  if (!bridge.baseUrl) return { ok: false, code: "unavailable", message: UNAVAILABLE };
  if (!bridge.jwt()) return { ok: false, code: "unavailable", message: SIGNED_OUT };
  try {
    return { ok: true, value: await bridge.call<T>(method, path, body) };
  } catch (error) {
    // The route is a 404 while the recommender is off: that is "not
    // available", not a failure — the strip is optional, the dashboard is not.
    if (statusOf(error) === 404) return { ok: false, code: "unavailable", message: UNAVAILABLE };
    return {
      ok: false,
      code: "failed",
      message: error instanceof Error ? error.message : "The request failed.",
    };
  }
}

/** The slate of the user: the pages, and why each of them is there. */
export async function fetchForYou(): Promise<ForYouResult<ForYou>> {
  const result = await request<ForYou>("GET", "/api/recs/for-you");
  if (!result.ok) return result;
  const value = result.value;
  return {
    ok: true,
    value: { ...value, items: Array.isArray(value?.items) ? value.items : [] },
  };
}

/**
 * The refusal of a page of the slate. The server checks that the page was in
 * a slate it issued to THIS user, and that the user did not opt out (C48).
 */
export async function markNotInterested(
  slate: string,
  pageId: string,
): Promise<ForYouResult<{ recorded: boolean }>> {
  const result = await request<{ recorded?: boolean }>("POST", "/api/recs/not-interested", {
    slate,
    pageId,
  });
  if (!result.ok) return result;
  return { ok: true, value: { recorded: result.value?.recorded === true } };
}
