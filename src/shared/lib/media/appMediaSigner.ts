import { API_BASE, getActivePageJwt, getActivePageUserId } from "@/shared/api/client";
import { createMediaSigner, parseSignAnswer, type SignAnswer, type SignTransport } from "@/shared/lib/media/mediaSigner";

/**
 * osionos#233: the app's one media signer, posting to the bridge's sign route with the page
 * session. Raw fetch on purpose: a 503 here means "no secret", not "bridge down", so it must not
 * reach the connectivity banner, and a failed sign only costs the stored URL.
 *
 * Caveat: a link for a known bridge other than API_BASE (beta) is signed by API_BASE, so it
 * opens only while both share MEDIA_URL_SECRET (they share one bridge today). An expired page
 * token answers 401, which renders the stored URL until the next try a minute later.
 */

const FAILED: SignAnswer = { kind: "failed" };

export interface FetchSignTransportOptions {
  apiBase: string;
  fetchImpl: typeof fetch;
  token: () => string | null;
}

export function createFetchSignTransport({ apiBase, fetchImpl, token }: FetchSignTransportOptions): SignTransport {
  return async (paths, pageId) => {
    if (!apiBase) return { kind: "off" };
    const bearer = token();
    if (!bearer) return FAILED;
    try {
      const response = await fetchImpl(`${apiBase}/api/media/uploads/sign`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
        body: JSON.stringify(pageId ? { pageId, paths } : { paths }),
      });
      if (response.status === 503) return { kind: "off" };
      if (!response.ok) return FAILED;
      return parseSignAnswer(await response.json(), response.headers.get("date"));
    } catch {
      return FAILED;
    }
  };
}

/** Extra bridge origins whose uploads are signed too (beta), comma-separated in the build env. */
export const KNOWN_MEDIA_BRIDGES: readonly string[] = (
  ((import.meta.env ?? {}) as Record<string, string>)["VITE_MEDIA_BRIDGE_ORIGINS"] ?? ""
).split(",").map((origin) => origin.trim()).filter(Boolean);

export const appMediaSigner = createMediaSigner({
  transport: createFetchSignTransport({ apiBase: API_BASE, fetchImpl: (input, init) => fetch(input, init), token: getActivePageJwt }),
  userId: getActivePageUserId,
});
