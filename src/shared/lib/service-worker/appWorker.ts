/**
 * Registers public/sw.js and moves a browser that still runs the copy at its first address
 * onto the current one.
 *
 * /sw.js was served "immutable" for a year, and Firefox answers every worker check from such
 * a cache entry without asking the server (2026-11-16, Firefox 158: 1 request on first visit,
 * 0 over 4 reloads, register() and update() included). A Firefox therefore kept the worker it
 * had installed on 2026-10-30 after its fix shipped. That worker answered navigations, which
 * under Firefox 158 holds every bridge call on a local-network check: 3,165 of the browser's
 * 7,168 bridge requests were cancelled, against 3 of 7,947 in a fresh profile.
 */

// Not "/sw.js": browsers hold that address as immutable until 2027-11, so no version of this
// file may register it again. The query gives the script an address no cache has, and the web
// server answers it with "no-cache", so it never needs another bump.
const WORKER_URL = "/sw.js?v=2";

const RELOAD_GAP_MS = 10_000;

type WorkerHost = Pick<ServiceWorkerContainer, "controller" | "register" | "addEventListener" | "removeEventListener">;

/** The one place the worker is registered: a second address would re-install it on each call. */
export function registerAppWorker(host: WorkerHost): Promise<ServiceWorkerRegistration> {
  return host.register(WORKER_URL);
}

/**
 * Registers the worker and calls `reload` once when it replaces a worker from another address
 * that this page was loaded under: only a load the old worker did not answer is free of what it
 * did to the page. A first visit is never reloaded, and neither is a page already under this
 * address, whatever newer copy of the script arrives later.
 */
export async function keepAppWorkerCurrent(host: WorkerHost, reload: () => void): Promise<void> {
  const loadedUnder = host.controller;
  const isMoving = loadedUnder !== null && !loadedUnder.scriptURL.endsWith(WORKER_URL);
  if (isMoving) host.addEventListener("controllerchange", reload, { once: true });
  try {
    await registerAppWorker(host);
  } catch (error) {
    host.removeEventListener("controllerchange", reload);
    throw error;
  }
}

/** What the page stands to lose if it reloads now. */
export interface PageAtReload {
  address: string;
  userHasTyped: boolean;
  msSinceLastReload: number;
}

/**
 * False when the reload above would cost the user something. Skipping it is cheap: the next
 * load is already under the current worker.
 * - Keystrokes: an edit made before the page's first load from the server is not flushed on unload.
 * - A sign-in token in the address: it works once, so a reload during its exchange loses the sign-in.
 * - A reload under 10 s ago: a server answering different worker bytes on every fetch reloaded
 *   Firefox 158 14 times in 15 s (2026-11-16).
 */
export function isWorkerReloadSafe(page: PageAtReload): boolean {
  return !page.userHasTyped && !page.address.includes("bridge_token") && page.msSinceLastReload > RELOAD_GAP_MS;
}
