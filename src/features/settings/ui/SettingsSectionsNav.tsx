/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsSectionsNav.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The settings sections list, straight from the registry. It is navigation, not
// tabs: the workspace tab strip is the only tabbed control here. Two layout
// roles from the same markup — a vertical column when the pane has room, and a
// horizontal strip above the panel when it does not (container-query variants).

import React, { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

import { recordSettingsAction } from "@/store/settings";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSection, type SettingsSectionId } from "@/features/settings/model/sections";
import type { StaticPersona } from "@/features/auth";
import { Button } from "@/shared/ui";
import { Avatar } from "@/features/settings/ui/settingsKit";

interface SettingsSectionsNavProps {
  section: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  persona: StaticPersona | null;
}

export const SettingsSectionsNav: React.FC<SettingsSectionsNavProps> = ({ section: active, onSelect, persona }) => {
  const listRef = useRef<HTMLDivElement>(null);

  // A deep link to a section scrolled past the strip's edge would open out of
  // sight; scroll the active row back into view when the list overflows.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    list.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  function exploreAi() {
    recordSettingsAction("cta_click_ai", { source: "settings_footer" });
    onSelect("ai");
  }

  return (
    <nav
      aria-label="Settings sections"
      className="shrink-0 border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] @max-[519px]:border-b @min-[520px]:w-[240px] @min-[520px]:overflow-y-auto @min-[520px]:border-r"
    >
      <div className="@min-[520px]:flex @min-[520px]:min-h-full @min-[520px]:flex-col @min-[520px]:justify-between">
        <div ref={listRef} className="flex gap-1 overflow-x-auto p-2 @min-[520px]:block @min-[520px]:space-y-4 @min-[520px]:overflow-visible">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.id} className="flex gap-1 @min-[520px]:block">
              <p className="@min-[520px]:block hidden px-2 py-1.5 text-xs font-medium text-[var(--osio-fg-subtle)]">{group.label}</p>
              <div className="flex gap-1 @min-[520px]:block @min-[520px]:space-y-0.5">
                {SETTINGS_SECTIONS.filter((entry) => entry.group === group.id).map((entry) => (
                  <SectionRow
                    key={entry.id}
                    section={entry}
                    active={entry.id === active}
                    persona={persona}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4 @min-[520px]:sticky @min-[520px]:bottom-0 @min-[520px]:block">
          <Button className="w-full" onClick={exploreAi}>
            <Sparkles size={16} /> Get osionos AI
          </Button>
        </div>
      </div>
    </nav>
  );
};

const SectionRow: React.FC<{
  section: SettingsSection;
  active: boolean;
  persona: StaticPersona | null;
  onSelect: (id: SettingsSectionId) => void;
}> = ({ section, active, persona, onSelect }) => (
  <button
    type="button"
    aria-current={active ? "page" : undefined}
    data-settings-section={section.id}
    onClick={() => onSelect(section.id)}
    className={[
      "flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 text-left text-sm @min-[520px]:w-full",
      "pointer-coarse:h-11",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]",
      active
        ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
        : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
    ].join(" ")}
  >
    {section.id === "profile"
      ? <Avatar value={persona?.emoji} label={persona?.name} size={22} />
      : <span className="flex h-5 w-5 items-center justify-center">{React.createElement(section.icon, { size: 16 })}</span>}
    <span className="truncate">{section.id === "profile" ? persona?.name ?? section.label : section.label}</span>
  </button>
);
