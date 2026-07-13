/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceIntentModal.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Briefcase, GraduationCap, Heart, type LucideIcon } from "lucide-react";
import { Modal } from "@/shared/ui/primitives/Modal";
import { useToastStore } from "@/shared/ui";
import { createWorkspaceWithIntent, useWorkspaceOnboarding } from "../model/useWorkspaceOnboarding";
import type { WorkspaceIntent } from "../model/starterKits";

const INTENTS: { key: WorkspaceIntent; Icon: LucideIcon; title: string; desc: string }[] = [
  { key: "work", Icon: Briefcase, title: "For work", desc: "Track projects, company goals, meeting notes" },
  { key: "personal", Icon: Heart, title: "For personal life", desc: "Write better, think more clearly, stay organized" },
  { key: "school", Icon: GraduationCap, title: "For school", desc: "Keep notes, research, and tasks in one place" },
];

/** "What is this space for?" — pick an intent → create + seed a new workspace. */
export const WorkspaceIntentModal: React.FC = () => {
  const open = useWorkspaceOnboarding((s) => s.open);
  const busy = useWorkspaceOnboarding((s) => s.busy);
  const setOpen = useWorkspaceOnboarding((s) => s.setOpen);

  const pick = async (intent: WorkspaceIntent) => {
    const ok = await createWorkspaceWithIntent(intent);
    if (!ok) useToastStore.getState().push({ kind: "error", title: "Couldn't create the workspace — try again" });
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="What is this space for?" description="Just a few more steps to unlock your new workspace" size="md">
      <div className="flex flex-col gap-3">
        {INTENTS.map(({ key, Icon, title, desc }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => void pick(key)}
            className="group flex items-center gap-4 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-left transition-[border-color,background-color] duration-200 hover:border-[var(--osio-accent)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)] transition-colors duration-200 group-hover:bg-[var(--osio-accent)] group-hover:text-[var(--osio-accent-fg)]">
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[var(--osio-fg-default)]">{title}</span>
              <span className="block text-sm text-[var(--osio-fg-muted)]">{desc}</span>
            </span>
          </button>
        ))}
        {busy && <p className="text-center text-xs text-[var(--osio-fg-subtle)]">Setting up your workspace…</p>}
      </div>
    </Modal>
  );
};
