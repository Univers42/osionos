/**
 * Build-time gate for the legacy second brain (the "graph" Home variant, the
 * graph_view block renderer, "Open in graph"). Default ON; build with
 * VITE_LEGACY_SECOND_BRAIN=false to remove every user entry point.
 *
 * Deliberately NOT a featureFlags.ts flag: those resolve URL → localStorage →
 * env, so any user could flip them with `?osio.<flag>=1`. This value is fixed
 * when the bundle is built (vite.config.ts `define` inlines it), and it is the
 * only place in src/ that reads the variable — everything else imports the const.
 */
export const LEGACY_SECOND_BRAIN_ENABLED =
  (import.meta.env.VITE_LEGACY_SECOND_BRAIN as string | undefined) !== "false";
