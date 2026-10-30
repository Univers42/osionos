/**
 * Whether the user can reach the bridge right now: the browser's own online flag, and
 * the outcome of every call made through the shared `api` client (#176).
 *
 * Caveat: "unreachable" means the request never got an answer from the bridge (the
 * network refused it, or a gateway answered 502/504). A 503 counts as an answer — the
 * bridge sends it for a feature that is off — so a bridge that is up but failing every
 * route with 503 reads as online. Calls outside `api` (media upload, the AI client,
 * the realtime socket) are not counted.
 */

import { create } from "zustand";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ConnectivityStatus = "online" | "offline" | "unstable";

/** Two failures in a row: one alone is a dropped request, not a connection. */
const UNSTABLE_AFTER = 2;

/** `inner`, telling `report` whether each call reached the bridge. Answers and errors pass through untouched. */
export function connectivityAwareFetch(inner: FetchLike, report: (reachable: boolean) => void): FetchLike {
  return async (input, init) => {
    let response: Response;
    try {
      response = await inner(input, init);
    } catch (error) {
      // A request the app cancelled says nothing about the network.
      if (!(error instanceof DOMException && error.name === "AbortError")) report(false);
      throw error;
    }
    report(response.status !== 502 && response.status !== 504);
    return response;
  };
}

interface ConnectivityState {
  browserOnline: boolean;
  /** Bridge calls in a row that got no answer. */
  failures: number;
  reportBridge: (reachable: boolean) => void;
  setBrowserOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  failures: 0,
  reportBridge: (reachable) => {
    const failures = reachable ? 0 : get().failures + 1;
    if (failures !== get().failures) set({ failures });
  },
  // Coming back online starts clean: failures counted while offline say nothing about now.
  setBrowserOnline: (online) => set(online ? { browserOnline: true, failures: 0 } : { browserOnline: false }),
}));

export function connectivityStatus(state: Pick<ConnectivityState, "browserOnline" | "failures">): ConnectivityStatus {
  if (!state.browserOnline) return "offline";
  return state.failures >= UNSTABLE_AFTER ? "unstable" : "online";
}

export interface ConnectivityNotice {
  kind: "success" | "warning";
  title: string;
  description: string;
}

const KEPT = "Your changes are kept on this device and sync when the connection is back.";

/** What to tell the user when the connection goes from `previous` to `next`; null when nothing changed. */
export function connectivityNotice(previous: ConnectivityStatus, next: ConnectivityStatus): ConnectivityNotice | null {
  if (previous === next) return null;
  if (next === "offline") return { kind: "warning", title: "You're offline", description: KEPT };
  if (next === "unstable") return { kind: "warning", title: "The connection to the server is unstable", description: KEPT };
  return {
    kind: "success",
    title: previous === "offline" ? "Back online" : "Connection restored",
    description: "Changes made meanwhile are being sent.",
  };
}
