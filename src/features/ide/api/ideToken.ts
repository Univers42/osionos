/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideToken.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The only place under features/ide that mints IDE tokens. The IDE origin accepts a
// 15-minute, one-workspace token; the app token authorises every bridge API for every
// workspace and is therefore presented to the main bridge alone (POST /api/ide/token).

export type IdeUnavailableReason = "not-configured" | "not-allowed" | "signed-out" | "throttled" | "error";

export type IdeTokenResult = { kind: "ok"; token: string } | { kind: "unavailable"; reason: IdeUnavailableReason };

export interface IdeTokenDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  /** The main bridge origin and the app token; resolved lazily so this module loads without the api client. */
  app: () => Promise<{ apiBase: string; token: string | null }>;
  /** "" means the IDE is not configured. */
  ideBase: () => string;
}

export interface IdeTokenSource {
  get: (workspaceId: string) => Promise<IdeTokenResult>;
  invalidate: (workspaceId: string) => void;
}

export const IDE_BASE: string = (
  ((import.meta.env as Record<string, string | undefined> | undefined)?.["VITE_OSIONOS_IDE_URL"] ?? "").trim()
).replace(/\/+$/, "");

// Ponytail: expiry is judged on the browser clock; a client clock more than 2 minutes fast
// re-mints on every call, one that is slow sends a token the server then refuses (a 401 or
// close 4011 recovers by invalidating).
export const REUSE_MARGIN_MS = 120_000;

const REASON_BY_STATUS: Readonly<Record<number, IdeUnavailableReason>> = {
  401: "signed-out",
  403: "not-allowed",
  404: "not-configured",
  429: "throttled",
};

const unavailable = (reason: IdeUnavailableReason): IdeTokenResult => ({ kind: "unavailable", reason });

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

interface MintOutcome {
  minted: CachedToken | null;
  result: IdeTokenResult;
}

async function parseMint(response: Response): Promise<CachedToken | null> {
  const body = (await response.json().catch(() => null)) as { ok?: unknown; token?: unknown; expiresAt?: unknown } | null;
  if (body?.ok !== true || typeof body.token !== "string" || body.token === "") return null;
  const expiresAtMs = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : Number.NaN;
  return Number.isFinite(expiresAtMs) ? { token: body.token, expiresAtMs } : null;
}

async function mint(deps: IdeTokenDeps, apiBase: string, token: string, workspaceId: string): Promise<MintOutcome> {
  const fail = (reason: IdeUnavailableReason): MintOutcome => ({ minted: null, result: unavailable(reason) });
  let response: Response;
  try {
    response = await deps.fetch(`${apiBase}/api/ide/token`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
  } catch {
    return fail("error");
  }
  if (response.status !== 200) return fail(REASON_BY_STATUS[response.status] ?? "error");
  const minted = await parseMint(response);
  return minted ? { minted, result: { kind: "ok", token: minted.token } } : fail("error");
}

/** Cache key: the workspace AND the app session that minted it. A sign-out followed by
 *  another account's sign-in in the same tab must never reuse the first account's token. */
const slotKey = (workspaceId: string, appToken: string): string => `${workspaceId}\u0000${appToken}`;
const isWorkspaceSlot = (key: string, workspaceId: string): boolean => key.startsWith(`${workspaceId}\u0000`);

export function createIdeTokenSource(deps: IdeTokenDeps): IdeTokenSource {
  const cache = new Map<string, CachedToken>();
  const inflight = new Map<string, Promise<IdeTokenResult>>();
  // Bumped by invalidate(): a get() that began before it must not join or fill the slots
  // that invalidate() just emptied (it read the session before the refusal was known).
  const generation = new Map<string, number>();

  const dropWorkspace = (map: Map<string, unknown>, workspaceId: string): void => {
    for (const key of [...map.keys()]) if (isWorkspaceSlot(key, workspaceId)) map.delete(key);
  };

  const start = (key: string, workspaceId: string, apiBase: string, appToken: string): Promise<IdeTokenResult> => {
    const promise: Promise<IdeTokenResult> = mint(deps, apiBase, appToken, workspaceId).then(({ minted, result }) => {
      // An invalidate() while this mint was in flight replaced or removed its slot: the
      // result may be the token that was just refused, so it must not repopulate the cache.
      if (minted && inflight.get(key) === promise) {
        dropWorkspace(cache, workspaceId);
        cache.set(key, minted);
      }
      return result;
    });
    inflight.set(key, promise);
    const clear = (): void => {
      if (inflight.get(key) === promise) inflight.delete(key);
    };
    void promise.then(clear, clear);
    return promise;
  };

  const get = async (workspaceId: string): Promise<IdeTokenResult> => {
    if (deps.ideBase() === "") return unavailable("not-configured");
    const startedAt = generation.get(workspaceId) ?? 0;
    const { apiBase, token } = await deps.app();
    if (apiBase === "") return unavailable("not-configured");
    if (token === null) return unavailable("signed-out");
    if ((generation.get(workspaceId) ?? 0) !== startedAt) return (await mint(deps, apiBase, token, workspaceId)).result;
    const key = slotKey(workspaceId, token);
    const cached = cache.get(key);
    if (cached && cached.expiresAtMs - deps.now() > REUSE_MARGIN_MS) return { kind: "ok", token: cached.token };
    return inflight.get(key) ?? start(key, workspaceId, apiBase, token);
  };

  const invalidate = (workspaceId: string): void => {
    generation.set(workspaceId, (generation.get(workspaceId) ?? 0) + 1);
    dropWorkspace(cache, workspaceId);
    dropWorkspace(inflight, workspaceId);
  };

  return { get, invalidate };
}

// The api client reads import.meta.env at load, so it is imported on first use: the
// node test runner (no Vite env) can import this module and drive createIdeTokenSource.
const defaultSource = createIdeTokenSource({
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  app: async () => {
    const client = await import("@/shared/api/client");
    return { apiBase: client.API_BASE, token: client.getActivePageJwt() };
  },
  ideBase: () => IDE_BASE,
});

export function getIdeToken(workspaceId: string): Promise<IdeTokenResult> {
  return defaultSource.get(workspaceId);
}

export function invalidateIdeToken(workspaceId: string): void {
  defaultSource.invalidate(workspaceId);
}
