// The identity header of the profile drawn as a page (groot ADR 0064 PS33): bound blocks,
// rendered by the page renderer against the viewed account's README record. Only README
// fields, never the avatar; the record is keyed by userId (toReadmeRecord), and useProfile
// merges a card only when its userId is the one viewed, so a namesake never fills it.

import React from "react";

import type { Block } from "@/entities/block";
import { BoundFieldEmptyText, type BoundRecord, type ReadmeFieldKey } from "@/entities/block/model/binding";
import { bound } from "@/data/templates/templateBlocks";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { BindingProvider } from "./model/binding";

const IDENTITY_LINES: readonly ReadmeFieldKey[] = ["username", "pronouns", "headline", "bio", "location"];

export const IDENTITY_BLOCKS: readonly Block[] = [
  bound("profile-identity-displayName", "displayName", 1),
  ...IDENTITY_LINES.map((field) => bound(`profile-identity-${field}`, field)),
];

export const ProfileIdentityHeader: React.FC<{ record: BoundRecord | null }> = ({ record }) => (
  <header aria-label="Profile" data-testid="profile-identity">
    <BindingProvider record={record}>
      <BoundFieldEmptyText.Provider value={null}>
        <PageBlocksRenderer blocks={IDENTITY_BLOCKS as Block[]} />
      </BoundFieldEmptyText.Provider>
    </BindingProvider>
  </header>
);
