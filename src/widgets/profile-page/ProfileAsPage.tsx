// The profile drawn as a page (groot ADR 0064 PS32–PS36), behind osio.profile.page and
// loaded only through ProfileOrPage's lazy import: the README page's cover (else the banner)
// read-only on top, the bound identity header, the actions row, then the README itself as
// ReadmeBlocks draws it for every viewer, or the owner's create action when there is none.

import React, { useMemo } from "react";

import { PageCover } from "@/entities/page/ui/PageCover";
import { profileCover } from "@/shared/lib/media/sharedCover";
// The cover's classes live in the page stylesheet; this chunk may load before any page did.
import "@/pages/notion-page/ui/notionPage.css";
import { CreateProfilePage } from "./CreateProfilePage";
import { ProfileIdentityHeader } from "./ProfileIdentityHeader";
import { ProfileActions } from "./profileChrome";
import { ReadmeBlocks } from "./ReadmeBlocks";
import { toReadmeRecord } from "./model/binding";
import type { ProfilePageMode } from "./model/profilePageMode";
import type { MemberProfile } from "./useProfile";
import { useReadmeCover } from "./useReadmeCover";

export interface ProfileAsPageProps {
  userId: string;
  profile: MemberProfile;
  isOwner: boolean;
  mode: Exclude<ProfilePageMode, "today">;
  onSaved?: () => void;
}

const ignoreCoverEdit = (): void => undefined;

export const ProfileAsPage: React.FC<ProfileAsPageProps> = ({ userId, profile, isOwner, mode, onSaved }) => {
  const pageCover = useReadmeCover(profile.readme?.pageId ?? null, isOwner);
  const cover = profileCover(pageCover, profile.bannerUrl);
  const record = useMemo(() => toReadmeRecord(profile), [profile]);
  return (
    <div data-testid="profile-as-page" className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      {cover && <PageCover cover={cover} onChangeCover={ignoreCoverEdit} onRemoveCover={ignoreCoverEdit} disabled />}
      <div className="mx-auto w-full max-w-3xl px-6 pb-12 pt-8">
        <ProfileIdentityHeader record={record} />
        <ProfileActions userId={userId} name={profile.name} />
        {mode === "create" ? <CreateProfilePage onCreated={onSaved} /> : <ReadmeBlocks readme={profile.readme} record={record} />}
      </div>
    </div>
  );
};
