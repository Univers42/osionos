// What a page served by this computer's osionos-node (/terminal/, /editor/) reads about itself: the
// app origins the node wrote into it, and the machine it runs on. The node is the only source of
// either; the app that frames the page can tell it neither. Both pages forget a remembered computer
// through the same node call.
import { readSelf } from "../vscode/machineSession";

export const pageAppOrigins = (): string[] =>
  (document.querySelector<HTMLMetaElement>('meta[name="osionos-app-origin"]')?.content ?? "").split(" ").filter(Boolean);

/** The node's machine id, and whether it remembers computers (an older node says nothing: R14). */
export async function selfNode(): Promise<{ node: string; remembers: boolean } | null> {
  const res = await fetch("/api/machine/self", { credentials: "same-origin" });
  const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
  const node = readSelf(body);
  return node ? { node, remembers: (body as { remember?: unknown }).remember === true } : null;
}

/** Tells the node to delete a device secret's record. */
export async function forgetOnNode(device: string): Promise<void> {
  await fetch("/api/machine/forget", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ device }) });
}
