export interface SlashAvailabilityContext {
  /** True when the built-in app with this identifier is usable (flag on, URL configured). */
  isAppReady: (appId: string) => boolean;
}

/** A command that names `requiresApp` exists only while that app is ready. Used both to
 *  filter the rendered list and to refuse a selection that arrives anyway (a stale menu,
 *  Enter on a row that was filtered out a moment ago). */
export function isSlashCommandAvailable(command: { requiresApp?: string }, { isAppReady }: SlashAvailabilityContext): boolean {
  return command.requiresApp === undefined || isAppReady(command.requiresApp);
}
