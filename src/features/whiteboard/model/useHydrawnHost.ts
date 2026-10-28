import { useEffect, useRef, type RefObject } from "react";

import { api, getActivePageJwt } from "@/shared/api/client";
import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";

import { TOKEN_REPLY, createTokenSource, originOf, readHydrawnMessage } from "./hydrawnHost";

const whiteboardToken = createTokenSource({
  getSession: getActivePageJwt,
  async mint(session) {
    const body = await api.post<{ token?: unknown; exp?: unknown }>("/api/whiteboard/token", {}, session);
    return typeof body?.token === "string" && typeof body.exp === "number" ? { token: body.token, exp: body.exp } : null;
  },
});

/** True when `url` is a page of the configured hydrawn origin. */
export function isWhiteboardFrameUrl(url: string): boolean {
  const origin = originOf(whiteboardAppUrl());
  return origin !== "" && originOf(url) === origin;
}

/** Answers the hydrawn frame in `frameRef` while it shows `url`: its token requests, and
 *  the board it reports creating (`onBoardCreated`). Inert for any other frame. */
export function useHydrawnHost(frameRef: RefObject<HTMLIFrameElement | null>, url: string, onBoardCreated?: (slug: string) => void): void {
  const onCreated = useRef(onBoardCreated);
  useEffect(() => {
    onCreated.current = onBoardCreated;
  }, [onBoardCreated]);

  useEffect(() => {
    if (!isWhiteboardFrameUrl(url)) return;
    const origin = originOf(url);
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      const message = readHydrawnMessage(event, frame, origin);
      if (message?.kind === "board-created") onCreated.current?.(message.slug);
      if (message?.kind !== "token-request") return;
      void whiteboardToken().then((minted) => {
        if (minted) frame?.postMessage({ type: TOKEN_REPLY, token: minted.token, exp: minted.exp }, origin);
      });
    };
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, [frameRef, url]);
}
