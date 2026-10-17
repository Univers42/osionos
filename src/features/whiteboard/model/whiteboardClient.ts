import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";
import { isBoardSlug } from "./boardRefs";

/** A failure of the whiteboard service, or of reaching it. `status` is 0 when no HTTP
 *  answer arrived; `code` is the service's error code (`{error: {code, message}}`). */
export class WhiteboardApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WhiteboardApiError";
    this.status = status;
    this.code = code;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ImportedScene {
  slug: string;
  /** Non-deleted elements the service reports holding after the write. */
  elementCount: number;
}

export interface WhiteboardClient {
  createBoard: (title: string) => Promise<{ slug: string }>;
  importScene: (slug: string, elements: readonly unknown[]) => Promise<ImportedScene>;
}

/** The whiteboard origin without a trailing slash, or "" when the build blanked it. */
export function whiteboardBaseUrl(): string {
  return whiteboardAppUrl().replace(/\/+$/, "");
}

/** The full board. Callers must pass a slug that already satisfied `isBoardSlug`. */
export function boardUrl(slug: string): string {
  return `${whiteboardBaseUrl()}/boards/${slug}`;
}

/** `v` (the service's `thumbnailAt`) busts the cache when the picture changes. */
export function thumbnailUrl(slug: string, version?: string): string {
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${whiteboardBaseUrl()}/v1/boards/${slug}/thumbnail${query}`;
}

async function readError(response: Response): Promise<WhiteboardApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
    const code = typeof body.error?.code === "string" ? body.error.code : "http_error";
    const message = typeof body.error?.message === "string" ? body.error.message : `The whiteboard service answered ${response.status}.`;
    return new WhiteboardApiError(response.status, code, message);
  } catch {
    return new WhiteboardApiError(response.status, "http_error", `The whiteboard service answered ${response.status}.`);
  }
}

async function send(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  if (whiteboardBaseUrl() === "") throw new WhiteboardApiError(0, "unavailable", "The whiteboard service is not configured.");
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new WhiteboardApiError(0, "network", "Could not reach the whiteboard service.");
  }
  if (!response.ok) throw await readError(response);
  return response.json();
}

function countLiveElements(body: unknown): number {
  const elements = (body as { scene?: { elements?: unknown } } | null)?.scene?.elements;
  if (!Array.isArray(elements)) return -1;
  return elements.filter((element) => (element as { isDeleted?: boolean } | null)?.isDeleted !== true).length;
}

/** Caveat: sends no credentials. The service resolves its owner itself (in its dev auth
 *  mode every caller is the same owner), so osionos users do not get separate galleries
 *  until the service verifies tokens. */
export function createWhiteboardClient(fetchImpl: FetchLike = (url, init) => fetch(url, init)): WhiteboardClient {
  return {
    async createBoard(title) {
      const body = (await send(fetchImpl, `${whiteboardBaseUrl()}/v1/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })) as { slug?: unknown };
      if (!isBoardSlug(body?.slug)) throw new WhiteboardApiError(0, "bad_response", "The whiteboard service returned an unusable board.");
      return { slug: body.slug };
    },
    async importScene(slug, elements) {
      if (!isBoardSlug(slug)) throw new WhiteboardApiError(0, "bad_slug", "That is not a valid board.");
      const body = await send(fetchImpl, `${whiteboardBaseUrl()}/v1/boards/${slug}`, {
        method: "PUT",
        // `*` replaces whatever revision exists: the board was created a moment ago
        // by this same import, or is a retry of it.
        headers: { "Content-Type": "application/json", "If-Match": "*" },
        body: JSON.stringify({ type: "osidraw", version: 1, elements }),
      });
      return { slug, elementCount: countLiveElements(body) };
    },
  };
}

export const whiteboardClient: WhiteboardClient = createWhiteboardClient();
