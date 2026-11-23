import type { HostedBoardApi, HydrawnBoard, HydrawnBoardSummary } from "@hydrawn/board";

/**
 * The bridge's whiteboard routes (`scripts/bridge-whiteboard.mjs`, hydrawn's v1 contract) as
 * `@hydrawn/board`'s `createHostedStore` calls them, for the board drawn in this page. They
 * take the short whiteboard token, never the app session: what the library holds can open
 * boards and nothing else, as it was in the frame (C596).
 */
export interface BridgeBoardApiDeps {
  /** The bridge origin (`VITE_API_URL`); "" for the page's own. */
  baseUrl: string;
  /** The whiteboard token, or null when signed out. */
  token: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** The library's `BoardStoreError`: the board tells a 404 and a 409 apart by its status. */
  refusal: (status: number, code: string, message: string) => Error;
}

const BOARDS = "/api/whiteboard/v1/boards";

async function refusalOf(response: Response, refusal: BridgeBoardApiDeps["refusal"]): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code : "request_failed";
  const message = typeof body?.error?.message === "string" ? body.error.message : `The whiteboard service answered ${response.status}.`;
  return refusal(response.status, code, message);
}

/** One request to the board routes under the whiteboard bearer; a refusal is thrown. */
function boardCaller({ baseUrl, token, fetchImpl = fetch, refusal }: BridgeBoardApiDeps) {
  const base = baseUrl.replace(/\/+$/, "");
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const bearer = await token();
    if (!bearer) throw refusal(401, "unauthorized", "Sign in to open this whiteboard.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${bearer}`);
    const response = await fetchImpl(`${base}${BOARDS}${path}`, { ...init, headers });
    if (!response.ok) throw await refusalOf(response, refusal);
    return response;
  };
}

/**
 * Whether the signed-in user has a live board under `slug`, asked of the list route, which
 * answers 200 either way: reading a missing board answers 404, and the browser reports that
 * in the console. Caveat: it walks the list a page at a time, so it costs up to three
 * requests for an account at the bridge's 200-board limit.
 */
export function createBoardLookup(deps: BridgeBoardApiDeps): (slug: string) => Promise<boolean> {
  const call = boardCaller(deps);
  return async (slug) => {
    let cursor: string | null = "0";
    while (cursor !== null) {
      const response = await call(`?limit=100&cursor=${encodeURIComponent(cursor)}`);
      const page = (await response.json()) as { boards?: { slug?: unknown }[]; nextCursor?: unknown };
      if (page.boards?.some((board) => board.slug === slug)) return true;
      cursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
    }
    return false;
  };
}

export function createBridgeBoardApi(deps: BridgeBoardApiDeps): HostedBoardApi {
  const call = boardCaller(deps);

  const sendJson = (method: string, body: unknown, extra: Record<string, string> = {}): RequestInit => ({
    method,
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });

  return {
    async getBoard(slug, options = {}) {
      const response = await call(`/${slug}${options.tombstones ? "?include=tombstones" : ""}`);
      return (await response.json()) as HydrawnBoard;
    },
    async replaceBoard(slug, scene, rev) {
      const response = await call(`/${slug}`, sendJson("PUT", scene, { "if-match": `"${rev}"` }));
      return (await response.json()) as HydrawnBoard;
    },
    async createBoard(title, slug) {
      const response = await call("", sendJson("POST", slug === undefined ? { title } : { title, slug }));
      return (await response.json()) as HydrawnBoardSummary;
    },
    async putThumbnail(slug, blob) {
      await call(`/${slug}/thumbnail`, { method: "PUT", headers: { "content-type": "image/png" }, body: blob });
    },
  };
}
