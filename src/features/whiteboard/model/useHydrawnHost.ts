import { useEffect, type RefObject } from "react";

import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";

import { TOKEN_REPLY, originOf, readHydrawnMessage } from "./hydrawnHost";
import { whiteboardToken } from "./whiteboardToken";

/** True when `url` is a page of the configured hydrawn origin. */
export function isWhiteboardFrameUrl(url: string): boolean {
  const origin = originOf(whiteboardAppUrl());
  return origin !== "" && originOf(url) === origin;
}

/** Answers the token requests of the hydrawn frame in `frameRef` while it shows `url`.
 *  Inert for any other frame. */
export function useHydrawnHost(frameRef: RefObject<HTMLIFrameElement | null>, url: string): void {
  useEffect(() => {
    if (!isWhiteboardFrameUrl(url)) return;
    const origin = originOf(url);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const frame = frameRef.current?.contentWindow ?? null;
      const message = readHydrawnMessage(event, frame, origin);
      if (message?.kind !== "token-request") return;
      void whiteboardToken().then((minted) => {
        if (minted) frame?.postMessage({ type: TOKEN_REPLY, token: minted.token, exp: minted.exp }, origin);
      });
    };
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, [frameRef, url]);
}
