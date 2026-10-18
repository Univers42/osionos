import { whiteboardAppUrl } from "@/shared/config/appUrls";
import type { InstalledMap } from "./useInstalledApps";

/** Catalog values the retired `osionos.draw` entry is rewritten to. They mirror the
 *  `osionos.whiteboard` seed row (scripts/seed-marketplace.mjs): a stored entry copies
 *  title, icon and launch fields at install time, so renaming the id alone would leave
 *  a "Draw" rail icon that opens the old native pane. */
const RETIRED_TO_WHITEBOARD = {
  from: "osionos.draw",
  to: "osionos.whiteboard",
  title: "Whiteboard",
  icon: "icon:pen-tool",
  launchKind: "embed" as const,
  // Native app: never loaded, but a literal loopback here would ship in every build.
  launchUrl: whiteboardAppUrl(),
};

/** Move a user's installed `osionos.draw` to `osionos.whiteboard`, keeping the choices they
 *  made (`active`, `autoUpdate`, `installedAt`). When both exist the whiteboard entry wins
 *  and the draw one is dropped. Pure and idempotent: a migrated map comes back `changed: false`. */
export function migrateInstalledMap(map: InstalledMap): { map: InstalledMap; changed: boolean } {
  const { from, to, ...catalog } = RETIRED_TO_WHITEBOARD;
  const retired = map[from];
  if (!retired) return { map, changed: false };
  const rest = { ...map };
  delete rest[from];
  if (rest[to]) return { map: rest, changed: true };
  const migrated = { ...retired, ...catalog, identifier: to };
  return { map: { ...rest, [to]: migrated }, changed: true };
}
