// Which profile a viewer gets under osio.profile.page (groot ADR 0064 PS32/PS34/PS37).
// "today" is the profile as it was before the flag, so the flag off, a profile still
// loading, and a visitor with nothing to show all land on the same DOM as before.

import type { MemberProfile } from "../useProfile";

export type ProfilePageMode = "today" | "page" | "create";

export interface ProfileViewer {
  isOwner: boolean;
  enabled: boolean;
}

export function profilePageMode(profile: MemberProfile | null, { isOwner, enabled }: ProfileViewer): ProfilePageMode {
  if (!enabled || !profile) return "today";
  const hasReadme = Boolean(profile.readme?.pageId);
  // The owner reads their own README without a card; only a visitor needs the username.
  if (isOwner) return hasReadme ? "page" : "create";
  return hasReadme && profile.username ? "page" : "today";
}
