/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AdminSpaceView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Admin space shell: a nav of the sections the caller's platform role may open, and the
 * selected section's body. The role gate is a hint — the bridge re-reads the role on every
 * admin request, so a stale or forged claim can hide or show a surface but never grant a right.
 * Templates and Moderation are built in (`model/adminSections.ts`); later sections are found
 * under `sections/<id>/section.ts`.
 */

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { usePlatformRole } from "@/features/auth";
import { BUILT_IN_SECTIONS, visibleSections, type AdminSection } from "../model/adminSections";
import { loadDiscoveredSections } from "../model/discoveredSections";
import { AdminSectionNav } from "./AdminSectionNav";

const bodies = new Map<string, React.LazyExoticComponent<React.ComponentType>>();

function bodyOf(section: AdminSection): React.LazyExoticComponent<React.ComponentType> {
  let body = bodies.get(section.id);
  if (!body) {
    body = React.lazy(section.load);
    bodies.set(section.id, body);
  }
  return body;
}

/** Built-in ids win: a discovered section cannot shadow Templates or Moderation. */
function mergeSections(discovered: readonly AdminSection[]): AdminSection[] {
  const taken = new Set(BUILT_IN_SECTIONS.map((section) => section.id));
  return [...BUILT_IN_SECTIONS, ...discovered.filter((section) => !taken.has(section.id))];
}

export const AdminSpaceView: React.FC = () => {
  const role = usePlatformRole();
  const [discovered, setDiscovered] = useState<AdminSection[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadDiscoveredSections().then((found) => { if (live) setDiscovered(found); });
    return () => { live = false; };
  }, []);

  const sections = useMemo(() => visibleSections(mergeSections(discovered), role), [discovered, role]);
  const selected = sections.find((section) => section.id === chosenId) ?? sections[0];

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--osio-bg-page)] text-center">
        <ShieldAlert size={28} className="text-[var(--osio-fg-subtle)]" />
        <p className="text-sm text-[var(--osio-fg-muted)]">Administrator access required.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)] sm:flex-row">
      <AdminSectionNav sections={sections} selectedId={selected.id} onSelect={setChosenId} />
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <h1 className="font-serif text-2xl font-bold">Admin space</h1>
          <Suspense fallback={<p className="mt-6 text-sm text-[var(--osio-fg-muted)]">Loading…</p>}>
            {React.createElement(bodyOf(selected))}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
