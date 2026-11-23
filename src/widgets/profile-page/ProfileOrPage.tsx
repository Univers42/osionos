// The osio.profile.page switch (groot ADR 0064 PS32/PS37/PS38). "today" returns the children
// untouched, so with the flag off the profile's DOM is exactly what it was; the page surface
// is its own chunk, fetched only when a profile is drawn as a page (ADR 0067 PH7).

import React, { Suspense, lazy } from "react";

import { isProfilePageEnabled } from "@/shared/config/featureFlags";
import { LoadingPane } from "@/shared/ui";
import { profilePageMode } from "./model/profilePageMode";
import type { MemberProfile } from "./useProfile";

const ProfileAsPage = lazy(() => import("./ProfileAsPage").then((m) => ({ default: m.ProfileAsPage })));

interface ProfileOrPageProps {
  userId: string;
  profile: MemberProfile | null;
  isOwner: boolean;
  onSaved?: () => void;
  children: React.ReactNode;
}

export const ProfileOrPage: React.FC<ProfileOrPageProps> = ({ userId, profile, isOwner, onSaved, children }) => {
  const mode = profilePageMode(profile, { isOwner, enabled: isProfilePageEnabled() });
  if (mode === "today" || !profile) return <>{children}</>;
  return (
    <Suspense fallback={<LoadingPane />}>
      <ProfileAsPage userId={userId} profile={profile} isOwner={isOwner} mode={mode} onSaved={onSaved} />
    </Suspense>
  );
};
