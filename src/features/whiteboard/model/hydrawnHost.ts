import { isBoardSlug } from "./boardRefs";

/**
 * osionos' side of the hydrawn frame protocol (devil C596). Hydrawn runs on its own origin
 * and talks to the bridge's whiteboard routes with a short whiteboard token; it asks this page
 * for one, and, framed at `/new`, tells this page which board it just created.
 *
 * A message counts only when it comes from that frame's own window AND from the whiteboard
 * origin AND is exactly one of the two shapes; every reply goes to that origin, never `"*"`.
 */

export const TOKEN_REQUEST = "hydrawn:token-request";
export const TOKEN_REPLY = "hydrawn:token";
export const BOARD_CREATED = "hydrawn:board-created";

export type HydrawnMessage = { kind: "token-request" } | { kind: "board-created"; slug: string };

export interface MintedToken {
  token: string;
  /** Expiry, in seconds since the epoch, as the bridge minted it. */
  exp: number;
}

/** The origin of `url`, or "" when it has none (blank, relative, malformed). */
export function originOf(url: string): string {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

function hasExactly(data: unknown, keys: string): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data) && Object.keys(data).sort().join(",") === keys;
}

/** What `event` asks of this page, or null when it is not one of hydrawn's messages from `frame`. */
export function readHydrawnMessage(event: Pick<MessageEvent, "data" | "origin" | "source">, frame: unknown, origin: string): HydrawnMessage | null {
  if (origin === "" || frame == null || event.source !== frame || event.origin !== origin) return null;
  const { data } = event;
  if (hasExactly(data, "type") && data.type === TOKEN_REQUEST) return { kind: "token-request" };
  if (hasExactly(data, "slug,type") && data.type === BOARD_CREATED && isBoardSlug(data.slug)) return { kind: "board-created", slug: data.slug };
  return null;
}

/** Re-minted when less than this is left, so a frame never receives one about to die. */
const REUSE_MARGIN_MS = 60_000;

export interface TokenSourceDeps {
  /** The app session the token is minted from; null when signed out. */
  getSession: () => string | null;
  mint: (session: string) => Promise<MintedToken | null>;
  now?: () => number;
}

/** One whiteboard token shared by every hydrawn frame on the page, re-minted near expiry
 *  and whenever the session changes, so an account switch never hands one user's token to
 *  another's frame. Concurrent asks for the same session share one mint. */
export function createTokenSource({ getSession, mint, now = Date.now }: TokenSourceDeps): () => Promise<MintedToken | null> {
  let held: { session: string; minted: MintedToken } | null = null;
  let pending: { session: string; promise: Promise<MintedToken | null> } | null = null;
  return async () => {
    const session = getSession();
    if (!session) return null;
    if (held?.session === session && held.minted.exp * 1000 - now() > REUSE_MARGIN_MS) return held.minted;
    if (pending?.session !== session) {
      const promise = mint(session).catch(() => null);
      pending = { session, promise };
      void promise.finally(() => {
        if (pending?.promise === promise) pending = null;
      });
    }
    const minted = await pending.promise;
    if (minted && getSession() === session) held = { session, minted };
    return minted;
  };
}
