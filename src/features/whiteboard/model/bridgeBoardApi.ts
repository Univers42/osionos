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

export function createBridgeBoardApi({ baseUrl, token, fetchImpl = fetch, refusal }: BridgeBoardApiDeps): HostedBoardApi {
  const base = baseUrl.replace(/\/+$/, "");

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const bearer = await token();
    if (!bearer) throw refusal(401, "unauthorized", "Sign in to open this whiteboard.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${bearer}`);
    const response = await fetchImpl(`${base}${BOARDS}${path}`, { ...init, headers });
    if (!response.ok) throw await refusalOf(response, refusal);
    return response;
  }

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
