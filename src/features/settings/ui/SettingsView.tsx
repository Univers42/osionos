/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
// The settings tab's body: section nav + search + one panel, fully driven by the
// registry. It renders inside a workspace tab (role=region), so it has NO close
// button — the tab strip closes it. Width responds to the PANE (container
// query), not the viewport: a split pane at 1440px can be 480px wide, a full
// pane at 375px must stack. No close button: the tab strip owns closing.

import React, { Suspense, useMemo, useRef } from "react";
import { useUserStore } from "@/features/auth";
import { SETTINGS_SECTIONS, findSection } from "@/features/settings/model/sections";
import { useSettingsNav } from "@/features/settings/model/settingsNav";
import { SettingsSectionsNav } from "@/features/settings/ui/SettingsSectionsNav";
import { SettingsSearch } from "@/features/settings/ui/SettingsSearch";
import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { SETTINGS_PANELS, type SettingsPanelProps } from "@/features/settings/ui/sectionPanels";

/** Reserve a few row heights so the lazy panel's arrival does not move the page. */
const SettingsPanelSkeleton: React.FC = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="h-24 rounded-md bg-[var(--osio-bg-subtle)]" />
    <div className="h-10 rounded-md bg-[var(--osio-bg-subtle)]" />
    <div className="h-10 rounded-md bg-[var(--osio-bg-subtle)]" />
  </div>
);

const RING_CLASSES = [
  "rounded-lg",
  "ring-2",
  "ring-[var(--osio-accent)]",
  "ring-offset-2",
  "ring-offset-[var(--osio-bg-surface)]",
] as const;

/** 1.4s, as the modal flashed its search result. Caveat: is a fixed guess — a
 *  slow reader loses the ring, a fast re-render (section switch) can clear it. */
const ANCHOR_FLASH_MS = 1400;

/** Sibling AFTER the panel inside its Suspense boundary — mounts only once the
 *  panel's DOM exists, so the anchor is always findable in the view root. */
const SettingsAnchorTarget: React.FC<{ viewRef: React.RefObject<HTMLDivElement | null> }> = ({ viewRef }) => {
  const anchor = useSettingsNav((s) => s.anchor);
  const clearAnchor = useSettingsNav((s) => s.clearAnchor);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  React.useEffect(() => {
    if (!anchor) return undefined;
    // rAF: let the panel's first paint settle before reading heights.
    const frame = requestAnimationFrame(() => {
      const target = viewRef.current?.querySelector(`[data-settings-anchor="${anchor}"]`);
      if (!target) return; // panel never rendered it — keep the anchor queued
      target.scrollIntoView({ block: "start" });
      target.classList.add(...RING_CLASSES);
      timerRef.current = globalThis.setTimeout(() => {
        target.classList.remove(...RING_CLASSES);
        clearAnchor();
      }, ANCHOR_FLASH_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [anchor, clearAnchor, viewRef]);

  return null;
};

export const SettingsView: React.FC = () => {
  const sectionId = useSettingsNav((s) => s.section);
  const setSection = useSettingsNav((s) => s.setSection);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const workspace = useUserStore((s) => s.activeWorkspace());
  const members = useUserStore((s) => s.personas);
  // A stale section id (an open tab persisted across a registry change) shows Profile.
  const section = findSection(sectionId) ?? SETTINGS_SECTIONS[0];
  const viewRef = useRef<HTMLDivElement>(null);

  const Panel = SETTINGS_PANELS[section.id];
  const panelProps = useMemo<SettingsPanelProps>(() => ({
    activeUserId,
    persona,
    workspaceId: workspace?._id,
    workspaceName: workspace?.name,
    members,
  }), [activeUserId, persona, workspace?._id, workspace?.name, members]);

  return (
    // The @container wrapper is OUTSIDE the region on purpose: a container query
    // matches against the nearest ANCESTOR container, so the region cannot query
    // its own width — `@container @min-[720px]:flex-row` on one element stays
    // flex-col forever (measured in e2e: the body collapsed to a 72px sliver).
    //
    // 720px is where the nav sits BESIDE the body: 240px of nav still leaves a
    // body that fits the widest panel control (the Preferences Mode control).
    // Below 720px of pane width the nav stacks above the body instead.
    // Caveat: Tailwind needs a container variant as a literal class string, so
    // the 720/719 pair is written out in SettingsSectionsNav.tsx too — the two
    // files have to change together.
    <div className="@container h-full min-h-0">
      <div
        ref={viewRef}
        role="region"
        aria-label="Settings"
        className="@min-[720px]:flex-row flex h-full min-h-0 flex-col overflow-hidden bg-[var(--osio-bg-page)]"
      >
        <SettingsSectionsNav section={section.id} onSelect={setSection} persona={persona} />
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* cqw, not vw: the padding follows the PANE, so a 555px split pane
              does not keep a 1440px viewport's 60px gutters. The @container
              wrapper above is the reference container. */}
          <div className="h-full overflow-y-auto px-[clamp(18px,5cqw,60px)] pb-20 pt-9">
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-9">
              <header className="space-y-2">
                <h1 className="text-2xl font-semibold leading-8 text-[var(--osio-fg-default)]">{section.title}</h1>
                <p className="text-base leading-6 text-[var(--osio-fg-default)]">{section.subtitle}</p>
                <SettingsSearch />
              </header>
              <Suspense fallback={<SettingsPanelSkeleton />}>
                {/* The panel id is on a wrapper INSIDE the boundary: e2e can wait for
                    the selected section's own subtree instead of racing the lazy load
                    (a stale previous panel or the skeleton would never match). */}
                <div data-settings-panel={section.id} className="contents">
                  <Panel {...panelProps} />
                  <SettingsAnchorTarget viewRef={viewRef} />
                </div>
              </Suspense>
            </div>
          </div>
        </div>
        <SudoPrompt />
      </div>
    </div>
  );
};
