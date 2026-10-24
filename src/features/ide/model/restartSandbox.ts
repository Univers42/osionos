import { ideFetch, type IdeFetchResult } from "../api/ideTransport";

/** Stops the user's box (DELETE /api/ide/session), which also disposes its terminal sessions; the
 *  next terminal recreates it from the image, so /tmp (including the login identity file) starts
 *  clean. This is the way back from a broken /etc/passwd link target, which no exec can repair
 *  (docs/adr/0009: a FIFO or an over-long line there makes every exec hang or fail). The home and
 *  workspace volumes are kept. */
export async function restartSandbox(
  workspaceId: string,
  send: (workspaceId: string, path: string, init?: RequestInit) => Promise<IdeFetchResult> = ideFetch,
): Promise<boolean> {
  try {
    const sent = await send(workspaceId, "/api/ide/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    return sent.kind === "response" && sent.response.ok;
  } catch {
    return false;
  }
}
