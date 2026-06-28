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
 * Admin space — the admin-only "Templates" directory. Each shell surface
 * (profile, marketplace app) is a REAL template page authored with the app's own
 * block + /canvas tools, tagged `templateSurface` via the existing isTemplate
 * mechanism (no parallel registry, no env ids). Gated on the signed is_admin
 * claim; the server re-enforces every write.
 */

import React, { useEffect, useState } from "react";
import { ShieldAlert, PenSquare, Plus, FileText } from "lucide-react";

import { useIsAdmin, useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page";
import { genId } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { TemplateSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";
import { seedTemplateContent } from "../model/templateSeed";

const SURFACES: { surface: TemplateSurface; label: string; desc: string }[] = [
  { surface: "profile", label: "Profile", desc: "The page every member sees, bound to their own record." },
  { surface: "marketplace-app", label: "Marketplace app", desc: "Each marketplace app's page, bound to the app record." },
];

function findTemplate(pages: Record<string, PageEntry[]>, surface: TemplateSurface): PageEntry | undefined {
  for (const list of Object.values(pages)) {
    const hit = list.find((p) => p.templateSurface === surface && p.isTemplate && !p.archivedAt);
    if (hit) return hit;
  }
  return undefined;
}

function openTemplate(page: PageEntry): void {
  useWorkspaceLayout.getState().openTab({
    tabId: genId("tab"), pageId: page._id, workspaceId: page.workspaceId, kind: "page",
    title: page.title || "Template", icon: "icon:layout",
  });
}

export const AdminSpaceView: React.FC = () => {
  const isAdmin = useIsAdmin();
  const ws = useUserStore((s) => s.activeWorkspace());
  const jwt = useUserStore((s) => s.activePageJwt());
  const pages = usePageStore((s) => s.pages);
  const addPage = usePageStore((s) => s.addPage);
  const fetchPages = usePageStore((s) => s.fetchPages);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (ws && jwt) void fetchPages(ws._id, jwt);
  }, [ws, jwt, fetchPages]);

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--osio-bg-page)] text-center">
        <ShieldAlert size={28} className="text-[var(--osio-fg-subtle)]" />
        <p className="text-sm text-[var(--osio-fg-muted)]">Administrator access required.</p>
      </div>
    );
  }

  const create = async (surface: TemplateSurface, label: string): Promise<void> => {
    if (!ws || !jwt) return;
    setBusy(surface);
    const page = await addPage(ws._id, `${label} template`, jwt, undefined, {
      isTemplate: true, templateSurface: surface, surface: "page", content: seedTemplateContent(surface),
    });
    setBusy(null);
    if (page) openTemplate(page);
  };

  return (
    <div className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="font-serif text-2xl font-bold">Admin space</h1>
        <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">
          Author the shell templates the whole app renders. Each is a real
          `/canvas` page bound to its record — create it once, edit it like any
          page, and it drives that surface for everyone.
        </p>
        <h2 className="mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">
          <FileText size={13} /> Templates
        </h2>
        <div className="mt-3 space-y-3">
          {SURFACES.map(({ surface, label, desc }) => {
            const tmpl = findTemplate(pages, surface);
            return (
              <div key={surface} className="rounded-[var(--osio-radius-card)] border border-[var(--osio-border-soft)] bg-[var(--osio-bg-surface)] p-4 shadow-[var(--osio-shadow-cell)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{label}</span>
                      <span className="rounded bg-[var(--osio-bg-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--osio-fg-muted)]">.tmpl</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">{desc}</p>
                  </div>
                  {tmpl ? (
                    <button
                      type="button"
                      onClick={() => openTemplate(tmpl)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
                    >
                      <PenSquare size={15} /> Edit
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === surface || !ws}
                      onClick={() => void create(surface, label)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50"
                    >
                      <Plus size={15} /> {busy === surface ? "Creating…" : "Create"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!ws ? <p className="mt-4 text-xs text-[var(--osio-fg-subtle)]">No active workspace to author templates in.</p> : null}
      </div>
    </div>
  );
};
