import { isWhiteboardEnabled } from "@/shared/config/featureFlags";
import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";

export const WHITEBOARD_APP_ID = "osionos.whiteboard";

/** The Whiteboard is built in: every account has it, with no install step. It is usable
 *  unless the `osio.whiteboard` kill-switch is off or the build blanked its URL
 *  (`VITE_WHITEBOARD_APP_URL=`), so nothing that cannot load is offered. Blocks already on
 *  a page keep rendering either way. */
export function isWhiteboardReady(): boolean {
  return isWhiteboardEnabled() && whiteboardAppUrl() !== "";
}

/** Readiness as the slash menu asks for it (`requiresApp`): the Whiteboard is the only
 *  built-in app that gates a command, so any other identifier is never ready. */
export function isBuiltInAppReady(appId: string): boolean {
  return appId === WHITEBOARD_APP_ID && isWhiteboardReady();
}
