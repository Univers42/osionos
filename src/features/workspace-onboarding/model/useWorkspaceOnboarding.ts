/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceOnboarding.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { calendarTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { STARTER_KITS, type WorkspaceIntent } from "./starterKits";

interface OnboardingState {
  open: boolean;
  busy: boolean;
  setOpen: (open: boolean) => void;
}

export const useWorkspaceOnboarding = create<OnboardingState>((set) => ({
  open: false,
  busy: false,
  setOpen: (open) => set({ open }),
}));

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

async function seedStarterPages(intent: WorkspaceIntent, workspaceId: string, jwt: string): Promise<{ id: string; title: string } | null> {
  const store = usePageStore.getState();
  let first: { id: string; title: string } | null = null;
  for (const page of STARTER_KITS[intent].pages) {
    const created = await store.addPage(workspaceId, page.title, jwt, undefined, { icon: page.icon, content: page.content });
    if (created && !first) first = { id: created._id, title: page.title };
  }
  return first;
}

/** Create a workspace for `intent`, seed its per-intent starter pages, open the
 *  first one (+ the Calendar tab). Returns false if creation failed. */
export async function createWorkspaceWithIntent(intent: WorkspaceIntent): Promise<boolean> {
  useWorkspaceOnboarding.setState({ busy: true });
  try {
    const kit = STARTER_KITS[intent];
    const workspace = await useUserStore.getState().createWorkspace(kit.defaultName, toSlug(kit.defaultName));
    if (!workspace) return false;
    const jwt = useUserStore.getState().activeSession()?.accessToken ?? "";
    usePageStore.getState().clearWorkspace(workspace._id);
    const first = await seedStarterPages(intent, workspace._id, jwt);
    if (kit.withCalendar) useWorkspaceLayout.getState().openTab(calendarTab());
    if (first) usePageStore.getState().openPage({ id: first.id, workspaceId: workspace._id, kind: "page", title: first.title });
    return true;
  } finally {
    useWorkspaceOnboarding.setState({ busy: false, open: false });
  }
}
