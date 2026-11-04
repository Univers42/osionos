// What the web terminal page opens each shell with (devil verdict 2026-11-01, W3, U6 and Amendment 1;
// groot ADR 0041): the session secret its node gave it while a shell of this frame is open; else a
// remembered computer's device secret beside a resume assertion the app fetched (R1); else one fresh
// token the app minted, which may wait on an emailed code. The device secret lives only in the node
// origin's own storage, keyed by the app origin the frame pinned (R4, R9): it is never posted to the
// app, put in a URL or logged, and storage that fails or was purged is simply the token path (R11).

export type PtyCredential =
  | { token: string; appOrigin?: string }
  | { secret: string }
  | { device: string; assertion: string; appOrigin: string };

export interface PtyCredentials {
  /** The next opening; it may wait for the app (a mint, or a step-up). */
  take(): Promise<PtyCredential>;
  keepSecret(secret: string): void;
  dropSecret(): void;
  /** The node issued this frame a device secret for the pinned app (R6). */
  keepDevice(device: string): void;
  /** The node refused the device secret: it is forgotten here, and the next opening asks for a token. */
  dropDevice(): void;
}

/** The node origin's localStorage, one device secret per app origin. It never throws. */
export interface RememberedStore {
  read(appOrigin: string): string | null;
  write(appOrigin: string, device: string): void;
  remove(appOrigin: string): void;
}

const KEY_PREFIX = "osionos-remembered:";
const DEVICE = /^[A-Za-z0-9_-]{43}$/;

/** A Storage reached through `storage()`: access throws in a credentialless or sandboxed frame, and
 *  Safari may purge it; either way this remembers nothing and the frame takes the token path (R11). */
export function rememberedStoreOver(storage: () => Storage): RememberedStore {
  return {
    read(appOrigin) {
      try {
        const value = storage().getItem(KEY_PREFIX + appOrigin);
        return value !== null && DEVICE.test(value) ? value : null;
      } catch { return null; }
    },
    write(appOrigin, device) {
      try { storage().setItem(KEY_PREFIX + appOrigin, device); } catch { /* this load is remembered by nothing */ }
    },
    remove(appOrigin) {
      try { storage().removeItem(KEY_PREFIX + appOrigin); } catch { /* there was nothing to remove */ }
    },
  };
}

export type CredentialAsk = "session" | "resume";
type Grant = { token: string } | { assertion: string };

export interface FrameCredentialsDeps {
  ask: (kind: CredentialAsk) => void;
  /** Set once the app spoke; a device secret is read and kept only under it. */
  appOrigin?: () => string | null;
  /** The node said it remembers computers (/api/machine/self); an older node is never shown an origin (R14). */
  remembers?: boolean;
  store?: RememberedStore | null;
  /** The page's `ready` already asked for the first grant (the dock answers it with one). */
  readyAsks?: boolean;
}

/** Grants from the app, one asked for at a time: the app's handshake holds one nonce at a time, so a
 *  second ask before the first answer would void the first identity check. */
export function createFrameCredentials({ ask, appOrigin = () => null, remembers = false, store = null, readyAsks = false }: FrameCredentialsDeps) {
  let secret: string | null = null;
  // #304: asking again before the ready's grant arrived crossed it in WebKit, and the dock minted a
  // second token, which after the step-up window asks a remembered computer for an emailed code.
  let readyAskOpen = readyAsks;
  // An app that never sent a resume predates them: asking it for one would wait forever.
  let appResumes = false;
  const grants: Grant[] = [];
  const waiting: Array<(grant: Grant) => void> = [];
  const pinned = () => (remembers && store ? appOrigin() : null);
  const device = () => { const origin = pinned(); return origin ? store?.read(origin) ?? null : null; };
  const nextAsk = (): CredentialAsk => (appResumes && device() ? "resume" : "session");

  function credentialOf(grant: Grant): PtyCredential | null {
    const origin = pinned();
    if ("token" in grant) return origin ? { token: grant.token, appOrigin: origin } : { token: grant.token };
    const remembered = device();
    return origin && remembered ? { device: remembered, assertion: grant.assertion, appOrigin: origin } : null;
  }

  function hand(grant: Grant): void {
    readyAskOpen = false;
    const next = waiting.shift();
    if (next) next(grant);
    else grants.push(grant);
    if (waiting.length > 0) ask(nextAsk());
  }

  return {
    async take(): Promise<PtyCredential> {
      for (;;) {
        if (secret) return { secret };
        const grant = grants.shift() ?? await new Promise<Grant>((resolve) => {
          if (waiting.length === 0 && !readyAskOpen) ask(nextAsk());
          waiting.push(resolve);
        });
        // An assertion with no device secret left (forgotten meanwhile) is useless: ask for a token.
        const credential = credentialOf(grant);
        if (credential) return credential;
      }
    },
    give: (token: string) => hand({ token }),
    giveResume(assertion: string) {
      appResumes = true;
      hand({ assertion });
    },
    keepSecret(value: string) { secret = value; },
    dropSecret() { secret = null; },
    keepDevice(value: string) {
      const origin = pinned();
      if (origin && DEVICE.test(value)) store?.write(origin, value);
    },
    dropDevice() {
      const origin = pinned();
      if (origin) store?.remove(origin);
    },
  };
}

export type FrameCredentials = ReturnType<typeof createFrameCredentials>;
