/**
 * Settings routes the app has stores for and no bridge mounts (none of them is in scripts/).
 * Each call answered 404, which the stores read as "stay local", and Chrome logged every one as
 * a console error (#293). The settings helpers answer null for them without asking. A route
 * leaves this list the day the bridge serves it: tests/canvas/unserved-settings-routes.test.ts
 * fails when scripts/ names its `marker`.
 */

export interface UnservedRoute {
  pattern: RegExp;
  /** The literal the bridge would contain once it mounts the route. */
  marker: string;
}

export const UNSERVED_SETTINGS_ROUTES: readonly UnservedRoute[] = [
  { pattern: /^\/api\/workspaces\/[^/]+\/billing(?:\/invoices)?$/, marker: "/billing" },
  { pattern: /^\/api\/imports$/, marker: "/api/imports" },
  { pattern: /^\/api\/notifications\/pages\/[^/]+$/, marker: "/api/notifications/pages" },
  { pattern: /^\/api\/settings\/actions$/, marker: "/api/settings/actions" },
];

export function isUnservedSettingsRoute(path: string): boolean {
  const bare = path.split("?")[0];
  return UNSERVED_SETTINGS_ROUTES.some((route) => route.pattern.test(bare));
}
