/**
 * Signed media links (osionos#233). The bridge signs an upload as `<path>?exp=&kid=&sig=`, and
 * that link dies within 2 h, so it must never be stored: every content write runs through
 * stripMediaSignature (D233-1). signableMedia says which URLs the app may ask the bridge to sign:
 * the bridge's own uploads only, never another host or another media route (D233-6).
 *
 * Caveat: both match on the URL's text shape. A signed link that was percent-encoded, or split
 * across two text runs, is not recognised and is stored as-is (it then expires, the image
 * breaks); a bridge reached under an origin missing from the known list is not signed and keeps
 * its bare read (counted by the bridge's bare-read log).
 */

/** The bridge's uploads route (`SERVE_RE`, scripts/bridge-media.mjs): owner uuid, sha256 key. */
export const MEDIA_UPLOAD_PATH = /^\/api\/media\/uploads\/([0-9a-f-]{36})\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/i;

const SIGNED_UPLOAD = /(\/api\/media\/uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}\.[a-z0-9]{1,8})\?([^\s"'<>()\\#]*)/gi;
const SIGNATURE_PARAM = /^(?:amp;)?(?:exp|kid|sig)=/i;

function keptQuery(query: string): string {
  const kept = query.split("&").filter((param) => param !== "" && !SIGNATURE_PARAM.test(param));
  if (kept.length === 0) return "";
  const joiner = query.includes("&amp;") ? "&amp;" : "&";
  return `?${kept.map((param) => param.replace(/^amp;/, "")).join(joiner)}`;
}

/** `text` with exp/kid/sig removed from every bridge-upload URL in it; otherwise byte-identical. */
export function stripMediaSignature(text: string): string {
  if (!text.includes("sig=")) return text;
  return text.replace(SIGNED_UPLOAD, (match, path: string, query: string) => {
    const rest = keptQuery(query);
    return query.split("&").some((param) => SIGNATURE_PARAM.test(param)) ? `${path}${rest}` : match;
  });
}

/** `value` with every string stripped; the same reference when nothing held a signature. */
export function stripMediaSignaturesDeep<T>(value: T): T {
  if (typeof value === "string") return stripMediaSignature(value) as T;
  if (Array.isArray(value)) return stripArray(value) as T;
  if (value === null || typeof value !== "object") return value;
  // The copy is made on the first change only: an unsigned page costs one walk, no allocation.
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(value)) {
    const entry = (value as Record<string, unknown>)[key];
    const stripped = stripMediaSignaturesDeep(entry);
    if (stripped !== entry) out ??= { ...(value as Record<string, unknown>) };
    if (out) out[key] = stripped;
  }
  return (out ?? value) as T;
}

function stripArray(items: readonly unknown[]): readonly unknown[] {
  let out: unknown[] | null = null;
  for (let index = 0; index < items.length; index += 1) {
    const stripped = stripMediaSignaturesDeep(items[index]);
    if (stripped !== items[index]) out ??= [...items];
    if (out) out[index] = stripped;
  }
  return out ?? items;
}

export interface SignableMedia {
  /** Prepended to the signed path to build the src: the bridge origin, '' for same-origin. */
  readonly origin: string;
  readonly path: string;
  /** The uploads segment: the account whose file this is. */
  readonly owner: string;
}

function uploadOf(origin: string, path: string): SignableMedia | null {
  const match = MEDIA_UPLOAD_PATH.exec(path);
  return match ? { origin, path, owner: match[1].toLowerCase() } : null;
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * The bridge upload `url` points at, or null for anything else. A bare path signs against
 * `bridgeBase` (API_BASE, '' when same-origin); an absolute URL only when its origin is the
 * bridge's or one of `knownBridges`, with no credentials and no query left after stripping.
 */
export function signableMedia(url: string, bridgeBase: string, knownBridges: readonly string[] = []): SignableMedia | null {
  const bare = stripMediaSignature(url);
  if (bare.startsWith("/")) return bare.startsWith("//") ? null : uploadOf(bridgeBase, bare);
  const origin = originOf(bare);
  if (origin === null) return null;
  const allowed = [bridgeBase, ...knownBridges].filter((entry) => entry !== "").map((entry) => originOf(entry));
  if (!allowed.includes(origin) || bare.slice(0, origin.length).toLowerCase() !== origin) return null;
  return uploadOf(origin, bare.slice(origin.length));
}
