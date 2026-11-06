import { api, getActivePageJwt } from "@/shared/api/client";

import { createTokenSource } from "./hydrawnHost";

/** The whiteboard token, shared by every board on the page — framed (`useHydrawnHost`) or
 *  drawn here (`inProcessBoard`). Minted from the app session by the bridge. */
export const whiteboardToken = createTokenSource({
  getSession: getActivePageJwt,
  async mint(session) {
    const body = await api.post<{ token?: unknown; exp?: unknown }>("/api/whiteboard/token", {}, session);
    return typeof body?.token === "string" && typeof body.exp === "number" ? { token: body.token, exp: body.exp } : null;
  },
});
