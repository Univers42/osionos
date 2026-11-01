// The node's IDE page answers ready from its light entry, which READY_TIMEOUT_MS was measured on
// (machineWindow.ts). A node too old for a page still serves that one, so an answer there means
// "update", not "not running".
import { readIdeMessage } from "@/features/ide/vscode/ideFrameProtocol";
import { LOCAL_NODE_ORIGIN, READY_TIMEOUT_MS } from "./machineWindow";
import { OLD_NODE_PROBE_URL } from "./terminalFrame";

export function probeOldNode(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = document.createElement("iframe");
    probe.hidden = true;
    probe.title = "osionos Connector check";
    probe.src = OLD_NODE_PROBE_URL;
    const done = (answer: boolean) => {
      clearTimeout(timer);
      globalThis.removeEventListener("message", onMessage);
      probe.remove();
      resolve(answer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source === probe.contentWindow && readIdeMessage(event.data, event.origin, LOCAL_NODE_ORIGIN)?.type === "osionos-ide/ready") done(true);
    };
    globalThis.addEventListener("message", onMessage);
    const timer = setTimeout(() => done(false), READY_TIMEOUT_MS);
    document.body.append(probe);
  });
}
