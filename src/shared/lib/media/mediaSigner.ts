/**
 * osionos#233: asks the bridge to sign the uploads the app shows, and remembers the answers.
 *
 * - D233-2: the caller's own paths go in calls with no pageId, foreign ones are grouped by the page
 *   they render in; a call holds at most 200 paths and one call per group is in flight.
 * - D233-3: a 503 (no secret on the bridge) turns signing off for 10 min with no request at all; an
 *   error or a path left out of the answer renders the stored URL and is asked again after a minute.
 * - D233-4: a link is kept for `exp − bridge now`, measured on the client's own clock from the
 *   moment the answer arrived, so a skewed client clock neither serves an expired link nor re-signs.
 * - D233-5: nothing here re-signs on a timer; only a mount (`sign`) or an error (`forget`) asks.
 * - N1 (security review): given `signs`, the signer is off (no request, the stored URL) until the
 *   bridge says it signs, so a bridge with no secret sees no traffic and first paint is unchanged.
 *
 * Caveat: the off window is a guess at how long a bridge stays unconfigured. A secret set during
 * it is used only after the 10 min (or a reload); a bridge that loses its secret is noticed on
 * the next miss. The 10 min lifetime margin is a guess at the longest gap between a cache hit and
 * the browser's request; a link that still dies in between is caught by the element's onError.
 * The bridge's word is read once per session: a secret set later is used after a reload, and an
 * element that mounts before the word arrives renders bare (under enforce: one 403, then its retry).
 */

import { MEDIA_UPLOAD_PATH } from "@/shared/lib/media/mediaSignature";

export type SignAnswer =
  | { kind: "signed"; signed: Record<string, string>; serverNowSec: number | null }
  | { kind: "off" }
  | { kind: "failed" };
export type SignTransport = (paths: string[], pageId: string | null) => Promise<SignAnswer>;
/** `signed`: use `path`. `bare`: render the stored URL now. `pending`: ask `sign` first. */
export type MediaLink = { kind: "signed"; path: string } | { kind: "bare" } | { kind: "pending" };

export interface MediaSigner {
  peek(path: string, pageId?: string | null): MediaLink;
  /** The signed path, or null when the stored URL should render. */
  sign(path: string, pageId?: string | null): Promise<string | null>;
  forget(path: string): void;
}

export interface MediaSignerOptions {
  transport: SignTransport;
  nowMs?: () => number;
  userId?: () => string | null;
  /** Whether the bridge signs (null: cannot say yet). Absent: assume it does. */
  signs?: (() => Promise<boolean | null>) | null;
}

export const MAX_SIGN_BATCH = 200;
const OFF_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const MARGIN_MS = 10 * 60_000;
const MIN_LIFETIME_SEC = 3600;
const PRUNE_AT = 1000;
const BARE: MediaLink = { kind: "bare" };
const PENDING: MediaLink = { kind: "pending" };

/** The bridge's answer body, with its clock from `now` or else the `Date` header. */
export function parseSignAnswer(body: unknown, dateHeader: string | null): SignAnswer {
  const signed = (body as { signed?: unknown } | null)?.signed;
  if (!signed || typeof signed !== "object" || Array.isArray(signed)) return { kind: "failed" };
  const links = Object.fromEntries(Object.entries(signed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const now = (body as { now?: unknown }).now;
  const dated = dateHeader ? Date.parse(dateHeader) : Number.NaN;
  const serverNowSec = typeof now === "number" && Number.isFinite(now) ? now : Number.isNaN(dated) ? null : Math.floor(dated / 1000);
  return { kind: "signed", signed: links, serverNowSec };
}

/** How long, in client ms from `receivedMs`, the signed link may be served from cache. */
function freshUntil(path: string, signed: string, serverNowSec: number | null, receivedMs: number): number {
  const exp = Number(new URLSearchParams(signed.slice(path.length + 1)).get("exp"));
  const lifetimeSec = serverNowSec !== null && Number.isFinite(exp) && exp > 0 ? exp - serverNowSec : MIN_LIFETIME_SEC;
  return receivedMs + Math.min(lifetimeSec, 2 * MIN_LIFETIME_SEC) * 1000 - MARGIN_MS;
}

const ownerOf = (path: string) => MEDIA_UPLOAD_PATH.exec(path)?.[1].toLowerCase() ?? null;

interface Lane { queue: Set<string>; busy: boolean; scheduled: boolean }

class BatchingMediaSigner implements MediaSigner {
  private readonly fresh = new Map<string, { path: string; until: number }>();
  private readonly failedAt = new Map<string, number>();
  private readonly waiting = new Map<string, Array<(signed: string | null) => void>>();
  private readonly lanes = new Map<string, Lane>();
  private offUntil = Number.NEGATIVE_INFINITY;
  private signing: boolean | null;
  private askedAt = Number.NEGATIVE_INFINITY;

  private readonly options: Required<MediaSignerOptions>;

  constructor(options: Required<MediaSignerOptions>) {
    this.options = options;
    this.signing = options.signs ? null : true;
  }

  peek(path: string, pageId: string | null = null): MediaLink {
    const link = this.cached(path);
    return link.kind === "pending" && !pageId && this.isForeign(path) ? BARE : link;
  }

  sign(path: string, pageId: string | null = null): Promise<string | null> {
    const link = this.peek(path, pageId);
    if (link.kind !== "pending") return Promise.resolve(link.kind === "signed" ? link.path : null);
    return new Promise((done) => {
      const waiters = this.waiting.get(path);
      if (waiters) {
        waiters.push(done);
        return;
      }
      this.waiting.set(path, [done]);
      this.schedule(this.laneOf(path, pageId)).queue.add(path);
    });
  }

  forget(path: string): void {
    this.fresh.delete(path);
  }

  /** What the cache alone says, with no request: fresh link, bare (off or failed), or pending. */
  private cached(path: string): MediaLink {
    const now = this.options.nowMs();
    const hit = this.fresh.get(path);
    if (hit && now < hit.until) return { kind: "signed", path: hit.path };
    if (!this.bridgeSigns(now) || now < this.offUntil || now - (this.failedAt.get(path) ?? Number.NEGATIVE_INFINITY) < RETRY_MS) return BARE;
    return PENDING;
  }

  /** N1: false until the bridge says it signs; "cannot say" (signed out) is asked again after a minute. */
  private bridgeSigns(now: number): boolean {
    if (this.signing !== null) return this.signing;
    if (now - this.askedAt >= RETRY_MS) {
      this.askedAt = now;
      void this.options.signs?.().then((signs) => { if (signs !== null) this.signing = signs; }, () => undefined);
    }
    return false;
  }

  /** True for a path owned by someone else, false for the caller's own, null when signed out. */
  private isForeign(path: string): boolean | null {
    const me = this.options.userId();
    return me === null ? null : ownerOf(path) !== me.toLowerCase();
  }

  private laneOf(path: string, pageId: string | null): string {
    return this.isForeign(path) && pageId ? pageId : "";
  }

  private schedule(key: string): Lane {
    const lane = this.lanes.get(key) ?? { queue: new Set<string>(), busy: false, scheduled: false };
    this.lanes.set(key, lane);
    if (!lane.scheduled && !lane.busy) {
      lane.scheduled = true;
      queueMicrotask(() => void this.flush(key, lane));
    }
    return lane;
  }

  private async flush(key: string, lane: Lane): Promise<void> {
    lane.scheduled = false;
    const batch = this.takeBatch(lane.queue);
    if (batch.length > 0) {
      lane.busy = true;
      const answer = await this.options.transport(batch, key || null).catch((): SignAnswer => ({ kind: "failed" }));
      lane.busy = false;
      this.settle(batch, answer);
    }
    if (lane.queue.size > 0) this.schedule(key);
    else this.lanes.delete(key);
  }

  /** The next batch of `queue`; a path answered meanwhile (or now off) settles without a request. */
  private takeBatch(queue: Set<string>): string[] {
    const batch: string[] = [];
    for (const path of queue) {
      if (batch.length >= MAX_SIGN_BATCH) break;
      queue.delete(path);
      const link = this.cached(path);
      if (link.kind === "pending") batch.push(path);
      else this.resolve(path, link.kind === "signed" ? link.path : null);
    }
    return batch;
  }

  private settle(paths: string[], answer: SignAnswer): void {
    const receivedMs = this.options.nowMs();
    if (answer.kind === "off") this.offUntil = receivedMs + OFF_MS;
    for (const path of paths) {
      const signed = answer.kind === "signed" ? answer.signed[path] : undefined;
      const usable = typeof signed === "string" && signed.startsWith(`${path}?`) ? signed : null;
      if (usable !== null && answer.kind === "signed") this.remember(path, usable, freshUntil(path, usable, answer.serverNowSec, receivedMs), receivedMs);
      else if (answer.kind !== "off") this.failedAt.set(path, receivedMs);
      this.resolve(path, usable);
    }
  }

  private remember(path: string, signed: string, until: number, receivedMs: number): void {
    if (until <= receivedMs) return;
    if (this.fresh.size >= PRUNE_AT) {
      for (const [key, entry] of this.fresh) if (entry.until <= receivedMs) this.fresh.delete(key);
    }
    this.fresh.set(path, { path: signed, until });
  }

  private resolve(path: string, signed: string | null): void {
    const waiters = this.waiting.get(path) ?? [];
    this.waiting.delete(path);
    for (const done of waiters) done(signed);
  }
}

export function createMediaSigner({ transport, nowMs = Date.now, userId = () => null, signs = null }: MediaSignerOptions): MediaSigner {
  return new BatchingMediaSigner({ transport, nowMs, userId, signs });
}
