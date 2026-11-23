// The profile drawn as a page (groot ADR 0064 PS32–PS36), behind osio.profile.page and
// loaded only through ProfileOrPage's lazy import: the README page's cover (else the banner)
// read-only on top, the bound identity header, the actions row, then the README itself as
// ReadmeBlocks draws it for every viewer, or the owner's create action when there is none.
// The owner's row is its own: Edit profile, and Edit page (the README) once there is one;
// OwnerActions' Customize would create an unseeded README beside CreateProfilePage.

import React, { useMemo } from "react";

import { openSettings } from "@/features/settings/model/settingsNav";
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
import { useReadmeCustomize } from "./useReadmeCustomize";

export interface ProfileAsPageProps {
  userId: string;
  profile: MemberProfile;
  isOwner: boolean;
  mode: Exclude<ProfilePageMode, "today">;
  onSaved?: () => void;
}

const ignoreCoverEdit = (): void => undefined;
const OWNER_BUTTON = "inline-flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--osio-bg-hover)] disabled:opacity-60";

const PageOwnerActions: React.FC<{ hasPage: boolean }> = ({ hasPage }) => {
  const { busy, message, gone, customize } = useReadmeCustomize();
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => openSettings("profile", "public-profile")} className={OWNER_BUTTON}>
          Edit profile
        </button>
        {hasPage && (
          <button type="button" disabled={busy} onClick={() => void customize(gone)} className={OWNER_BUTTON}>
            {gone ? "Create a new README" : "Edit page"}
          </button>
        )}
      </div>
      {message && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{message}</p>}
    </div>
  );
};

export const ProfileAsPage: React.FC<ProfileAsPageProps> = ({ userId, profile, isOwner, mode, onSaved }) => {
  const pageCover = useReadmeCover(profile.readme?.pageId ?? null, isOwner);
  const cover = profileCover(pageCover, profile.bannerUrl);
  const record = useMemo(() => toReadmeRecord(profile), [profile]);
  return (
    <div data-testid="profile-as-page" className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      {cover && <PageCover cover={cover} onChangeCover={ignoreCoverEdit} onRemoveCover={ignoreCoverEdit} disabled />}
      <div className="mx-auto w-full max-w-3xl px-6 pb-12 pt-8">
        <ProfileIdentityHeader record={record} />
        {isOwner ? <PageOwnerActions hasPage={mode === "page"} /> : <ProfileActions userId={userId} name={profile.name} />}
        {mode === "create" ? <CreateProfilePage onCreated={onSaved} /> : <ReadmeBlocks readme={profile.readme} record={record} />}
      </div>
    </div>
  );
};
