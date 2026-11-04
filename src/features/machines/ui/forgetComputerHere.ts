// The browser half of "Forget this computer" (forgetComputer.ts): a zero-size frame of the node's
// terminal page, never shown, and a toast that says what happened in plain words.
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import { frameAllow } from "@/shared/lib/dom/frameAllow";
import { forgetThisComputer } from "../model/forgetComputer";
import { NODE_FRAME_PERMISSIONS } from "../model/machineWindow";
import { TERMINAL_PAGE_URL } from "../model/terminalFrame";

export async function forgetComputerHere(): Promise<void> {
  const outcome = await forgetThisComputer({
    openFrame: () => {
      const frame = document.createElement("iframe");
      frame.src = TERMINAL_PAGE_URL;
      frame.title = "Forget this computer";
      const allow = frameAllow(NODE_FRAME_PERMISSIONS);
      if (allow) frame.setAttribute("allow", allow);
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
      document.body.append(frame);
      return { window: frame.contentWindow, remove: () => frame.remove() };
    },
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      globalThis.addEventListener("message", onMessage);
      return () => globalThis.removeEventListener("message", onMessage);
    },
    schedule: (fire, ms) => {
      const timer = setTimeout(fire, ms);
      return () => clearTimeout(timer);
    },
  });
  useToastStore.getState().push(outcome === "forgotten"
    ? { kind: "success", title: "This computer is forgotten", description: "The next time your terminal opens here, we email you a code first." }
    : { kind: "error", title: "Could not reach osionos Connector", description: "Start osionos Connector on this computer, then try again." });
}
