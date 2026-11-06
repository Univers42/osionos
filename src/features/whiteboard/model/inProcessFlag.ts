import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";

/** The inline whiteboard drawn in this page (`@hydrawn/board`, vendored) instead of framed
 *  from hydrawn's origin. Default OFF until it matches the frame: it loads hydrawn's code into
 *  osionos' own origin, saving through the bridge with the whiteboard token only. Enable via
 *  `?osio.whiteboard.inprocess=1`, the same-named localStorage key, or
 *  `VITE_OSIO_WHITEBOARD_INPROCESS=1`. A file of its own rather than featureFlags.ts or
 *  whiteboardAvailability.ts, both in the entry chunk: only the whiteboard block reads it, so
 *  the entry stays byte-identical. */
export function isInProcessWhiteboardEnabled(): boolean {
  return isFeatureFlagEnabled("osio.whiteboard.inprocess", false);
}
