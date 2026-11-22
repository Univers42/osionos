// Bridge answers for the CSP sweep's surfaces that need server state: an in-memory whiteboard,
// and a direct-message channel with one upload. Both mirror what bridge-stub specs already stub
// (whiteboardInProcess, directMessages), cut to what reaching the surface needs.
// Caveat: answers are canned; they prove the surface loads its code, not that the bridge works.

import { OTHER, answerProfileReads } from "./profilePageMocks.mjs";

export const BOARD_SLUG = "abcdefgh2345";
export const BOARD_PAGE = {
  _id: "6a1760000000000000000002", title: "Sweep board", workspaceId: "ws-bridge", ownerId: "user-bridge-spec",
  visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null,
  updatedAt: "2026-11-04T00:00:00.000Z",
  content: [{ id: "wb-block", type: "whiteboard", content: "Sweep plan", boardSlug: BOARD_SLUG }],
};

export function whiteboardAnswer() {
  const board = { slug: BOARD_SLUG, title: "Sweep plan", rev: 0, bounds: null, elementCount: 0, createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z", thumbnailAt: null, scene: { type: "osidraw", version: 1, elements: [] } };
  return (url, request) => {
    const method = request.method();
    if (url.pathname === "/api/whiteboard/token" && method === "POST") return { json: { ok: true, token: "wb-e2e", exp: Math.floor(Date.now() / 1000) + 600 } };
    if (url.pathname === "/api/pages/all") return { json: [BOARD_PAGE] };
    if (url.pathname === `/api/pages/${BOARD_PAGE._id}` && method === "GET") return { json: BOARD_PAGE };
    if (url.pathname.endsWith("/thumbnail")) return { status: 204 };
    if (!url.pathname.startsWith("/api/whiteboard/v1/boards")) return undefined;
    if (method === "PUT") return { json: { ...board, rev: board.rev + 1 } };
    return { json: board };
  };
}

export const DM = {
  id: "dm-bob", workspaceId: "ws-1", kind: "dm", name: "Bob Jones", topic: null,
  createdBy: OTHER.id, isPrivate: true, memberRole: "member", createdAt: "2026-10-30T09:00:00.000Z",
};

export function directMessageAnswer() {
  return (url, request) => {
    const profile = answerProfileReads(url);
    if (profile) return profile;
    const method = request.method();
    if (url.pathname === "/api/chat/dm" && method === "POST") return { json: { channel: DM } };
    if (url.pathname === "/api/chat/channels" && method === "GET") return { json: { channels: [DM] } };
    if (url.pathname === "/api/chat/uploads" && method === "POST") {
      const sha = "c".repeat(64);
      return { status: 201, json: { ok: true, attachment: { type: "file", bucket: "chat", objectKey: `${sha}.png`, sha256: sha, name: url.searchParams.get("name"), mimeType: "image/png", size: 70, metadata: {} } } };
    }
    if (url.pathname === `/api/chat/channels/${DM.id}/messages` && method === "GET") return { json: { channelId: DM.id, workspaceId: DM.workspaceId, messages: [] } };
    return undefined;
  };
}
