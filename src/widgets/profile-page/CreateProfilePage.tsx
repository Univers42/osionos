// The owner's explicit way in when the profile has no README page yet (groot ADR 0064 PS34):
// a click creates it from the Profile shell and opens it; viewing the profile creates nothing.
// A linked README that was archived is said first, and the next click replaces it, as
// ReadmePrompt does: only the owner's explicit choice ever relinks the profile.

import React from "react";

import { Button } from "@/shared/ui";
import { profileReadmeSeed } from "./model/profileReadmeSeed";
import { useReadmeCustomize } from "./useReadmeCustomize";

export const CreateProfilePage: React.FC<{ onCreated?: () => void }> = ({ onCreated }) => {
  const { busy, message, gone, customize } = useReadmeCustomize(profileReadmeSeed);
  const create = async () => {
    if (await customize(gone)) onCreated?.();
  };
  return (
    <section aria-label="Profile page" data-testid="profile-page-create" className="mt-8 rounded-lg border border-[var(--osio-border-default)] p-6">
      <p className="text-sm text-[var(--osio-fg-muted)]">
        Your profile has no page yet. Create one to tell visitors about yourself; it opens in a new tab for you to fill.
      </p>
      <Button type="button" className="mt-4" disabled={busy} onClick={() => void create()}>
        {gone ? "Create a new profile page" : "Create profile page"}
      </Button>
      {message && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{message}</p>}
    </section>
  );
};
