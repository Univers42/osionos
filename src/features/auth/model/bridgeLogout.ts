/**
 * "Sign out of all devices": the bridge call, its outcomes, and the order that makes it safe.
 *
 * `POST /api/auth/bridge/logout` with the persona's own app-session token ends every app
 * session of that user on every device. The token must be sent BEFORE local state is
 * cleared (afterwards there is nothing to send), and local state is cleared whatever the
 * result: a refused or unreachable bridge must never leave the user signed in here.
 *
 * Kept free of `import.meta.env` and stores so it runs under the node test runner.
 *
 * Caveat: the 8 s timeout is a guess. A bridge that answers after it may still have recorded
 * the sign-out while we report "unreachable"; the notice then understates what happened.
 */

export const BRIDGE_LOGOUT_PATH = "/api/auth/bridge/logout";
export const BRIDGE_LOGOUT_TIMEOUT_MS = 8000;

export type BridgeLogoutOutcome =
  | { kind: "signed_out_everywhere" }
  | { kind: "already_revoked" }
  | { kind: "cutoffs_unavailable" }
  | { kind: "user_not_found" }
  | { kind: "unsupported" }
  | { kind: "rejected"; status: number }
  | { kind: "unreachable" }
  | { kind: "not_applicable" };

export interface LogoutNotice {
  kind: "success" | "info" | "error";
  title: string;
  description?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function errorCode(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  return typeof body?.code === "string" ? body.code : null;
}

async function outcomeFor(response: Response): Promise<BridgeLogoutOutcome> {
  if (response.status === 204) return { kind: "signed_out_everywhere" };
  if (response.status === 404) return { kind: "unsupported" };
  const code = await errorCode(response);
  if (response.status === 401 && code === "session_revoked") return { kind: "already_revoked" };
  if (response.status === 503 && code === "session_cutoffs_unavailable") return { kind: "cutoffs_unavailable" };
  if (response.status === 409 && code === "user_not_found") return { kind: "user_not_found" };
  return { kind: "rejected", status: response.status };
}

/** Never throws: a network error or timeout is the `unreachable` outcome. */
export async function requestBridgeLogout(
  apiBase: string,
  token: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = BRIDGE_LOGOUT_TIMEOUT_MS,
): Promise<BridgeLogoutOutcome> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBase}${BRIDGE_LOGOUT_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    return await outcomeFor(response);
  } catch {
    return { kind: "unreachable" };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

const THIS_DEVICE_ONLY = "You are signed out on this device only.";

/** What the user is told. `not_applicable` (no bridge session ever existed) says nothing. */
export function noticeFor(outcome: BridgeLogoutOutcome): LogoutNotice | null {
  switch (outcome.kind) {
    case "signed_out_everywhere":
      return { kind: "success", title: "Signed out of all devices" };
    case "already_revoked":
      return { kind: "info", title: "Already signed out of all devices", description: "This session had been signed out everywhere before." };
    case "unsupported":
      return { kind: "error", title: "Signed out on this device only", description: "This server cannot sign out your other devices yet." };
    case "cutoffs_unavailable":
      return { kind: "error", title: "Other devices were not signed out", description: `The server could not record it. ${THIS_DEVICE_ONLY} Try again in a moment.` };
    case "user_not_found":
      return { kind: "error", title: "Other devices were not signed out", description: `The server does not know this account. ${THIS_DEVICE_ONLY}` };
    case "rejected":
      return { kind: "error", title: "Other devices were not signed out", description: `The server refused the request (${outcome.status}). ${THIS_DEVICE_ONLY}` };
    case "unreachable":
      return { kind: "error", title: "Other devices were not signed out", description: `The server could not be reached. ${THIS_DEVICE_ONLY}` };
    case "not_applicable":
      return null;
  }
}

export const REVOKED_NOTICE: LogoutNotice = {
  kind: "info",
  title: "You were signed out",
  description: "This account was signed out of all devices. Sign in again; your unsynced edits are kept.",
};

export interface SignOutDeps {
  request: (token: string) => Promise<BridgeLogoutOutcome>;
  clearLocal: (userId: string) => void;
  notify: (notice: LogoutNotice) => void;
}

/**
 * Sends THAT persona's token (not the active one), then clears local state whatever
 * happened, then tells the user when the other devices were not signed out.
 */
export async function signOutEverywhere(
  userId: string,
  sessions: Record<string, { accessToken: string } | undefined>,
  deps: SignOutDeps,
): Promise<BridgeLogoutOutcome> {
  const token = sessions[userId]?.accessToken;
  let outcome: BridgeLogoutOutcome = { kind: "not_applicable" };
  try {
    if (token) outcome = await deps.request(token);
  } catch {
    outcome = { kind: "unreachable" };
  } finally {
    deps.clearLocal(userId);
  }
  const notice = noticeFor(outcome);
  if (notice) deps.notify(notice);
  return outcome;
}
