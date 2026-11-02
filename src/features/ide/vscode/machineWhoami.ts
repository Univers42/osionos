// A page on this computer's node relays the app's hello nonce to the node's same-origin
// /api/machine/whoami (devil verdict 2026-10-31, condition 5) and hands back what the node signed.
// The page signs nothing itself. The node's answer is re-read with the app's own parser, so only a
// well-formed identity is sent. Shared by the IDE page and the web terminal page.
import { readIdeMessage, type IdeMessage } from "./ideFrameProtocol.ts";

export async function whoami(nonce: string): Promise<IdeMessage | null> {
  const res = await fetch("/api/machine/whoami", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce }),
  });
  if (res.status !== 200) return null;
  const body = (await res.json().catch(() => null)) as { machineId?: unknown; sig?: unknown } | null;
  const message = readIdeMessage({ type: "osionos-ide/identity", machineId: body?.machineId, sig: body?.sig }, location.origin, location.origin);
  return message?.type === "osionos-ide/identity" ? message : null;
}
