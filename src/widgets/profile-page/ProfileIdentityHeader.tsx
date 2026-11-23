// The identity header of the profile drawn as a page (groot ADR 0064 PS33): bound blocks,
// rendered by the page renderer against the viewed account's README record. Only README
// fields, never the avatar; the record is keyed by userId (toReadmeRecord), and useProfile
// merges a card only when its userId is the one viewed, so a namesake never fills it.

import React from "react";

import type { Block } from "@/entities/block";
import { BoundFieldEmptyText, boundFieldText, type BoundRecord, type ReadmeFieldKey } from "@/entities/block/model/binding";
import { bound } from "@/data/templates/templateBlocks";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { BindingProvider } from "./model/binding";

const IDENTITY_LINES: readonly ReadmeFieldKey[] = ["username", "pronouns", "headline", "bio", "location"];

const NAME_BLOCK = bound("profile-identity-displayName", "displayName", 1);
const LINE_BLOCKS = IDENTITY_LINES.map((field) => bound(`profile-identity-${field}`, field));

export const IDENTITY_BLOCKS: readonly Block[] = [NAME_BLOCK, ...LINE_BLOCKS];

// A bound heading block draws a styled span, so the role makes the name the page's heading
// (an <h1> may not hold the renderer's block divs); no name, no empty heading.
export const ProfileIdentityHeader: React.FC<{ record: BoundRecord | null }> = ({ record }) => (
  <section aria-label="Profile" data-testid="profile-identity">
    <BindingProvider record={record}>
      <BoundFieldEmptyText.Provider value={null}>
        {boundFieldText(record, "displayName") !== null && (
          <div role="heading" aria-level={1}>
            <PageBlocksRenderer blocks={[NAME_BLOCK]} />
          </div>
        )}
        <PageBlocksRenderer blocks={LINE_BLOCKS} />
      </BoundFieldEmptyText.Provider>
    </BindingProvider>
  </section>
);
