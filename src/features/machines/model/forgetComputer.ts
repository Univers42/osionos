// "Forget this computer" (devil verdict 2026-11-01, Amendment 1, R8): only the terminal page, on the
// node's origin, can reach the device secret it keeps, so the app opens that page out of sight, waits
// for its ready, says `forget` and waits for `forgotten`. The page drops its secret and asks its node
// to delete the record. The next load takes the emailed-code path. Shells already open keep running.
import { readIdeMessage } from "../../ide/vscode/ideFrameProtocol.ts";
import { LOCAL_NODE_ORIGIN } from "./machineWindow.ts";

// Caveat: the page answers after its bundle loads and its node replies; a cold disk or the browser's
// local-network prompt can take longer than this, and the person then reads "could not reach" while
// the forget may still land. Measured ready times are under 1 s (terminalFrame.ts), so 10 s is ~10x.
export const FORGET_TIMEOUT_MS = 10_000;

type FrameEvent = { data: unknown; origin: string; source: unknown };

export type ForgetDeps = {
  /** A hidden frame of the node's terminal page; `remove` takes it out of the document. */
  openFrame: () => { window: { postMessage(message: unknown, origin: string): void } | null; remove(): void };
  listen: (handler: (event: FrameEvent) => void) => () => void;
  schedule: (fire: () => void, ms: number) => () => void;
};

export type ForgetOutcome = "forgotten" | "unreachable";

export function forgetThisComputer({ openFrame, listen, schedule }: ForgetDeps): Promise<ForgetOutcome> {
  return new Promise((resolve) => {
    const frame = openFrame();
    let asked = false;
    const finish = (outcome: ForgetOutcome) => {
      stopListening();
      cancel();
      frame.remove();
      resolve(outcome);
    };
    const stopListening = listen((event) => {
      if (!frame.window || event.source !== frame.window) return;
      const message = readIdeMessage(event.data, event.origin, LOCAL_NODE_ORIGIN);
      if (message?.type === "osionos-ide/ready" && !asked) {
        asked = true;
        frame.window.postMessage({ type: "osionos-ide/forget" }, LOCAL_NODE_ORIGIN);
      }
      if (message?.type === "osionos-ide/forgotten") finish("forgotten");
    });
    const cancel = schedule(() => finish("unreachable"), FORGET_TIMEOUT_MS);
  });
}
