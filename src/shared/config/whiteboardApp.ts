// import.meta.env is undefined outside Vite (node tests) — guard the module-scope read.
const VITE_ENV = ((import.meta as { env?: Record<string, string> }).env ?? {}) as Record<string, string>;
const WHITEBOARD_APP_URL = (VITE_ENV["VITE_WHITEBOARD_APP_URL"] ?? "https://localhost:3007").trim();

/** The configured Whiteboard origin, or "" when the build blanked it. `??` above keeps an
 *  explicit empty value (only an ABSENT var falls back), so setting
 *  `VITE_WHITEBOARD_APP_URL=` is how a build opts out of the whiteboard entirely: the rail icon,
 *  the slash command and the legacy-draw import all read this, so nothing that cannot load is offered. */
export function whiteboardAppUrl(): string {
  return WHITEBOARD_APP_URL;
}
