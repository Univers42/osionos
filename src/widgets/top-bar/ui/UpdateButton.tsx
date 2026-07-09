/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UpdateButton.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import { useUserStore } from "@/features/auth";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";
import { usePageStore } from "@/store/usePageStore";
import { rebuildServerUp, runHostRebuild } from "../model/rebuild";

/**
 * Update button (blue). When the host rebuild daemon (`make rebuild-server`) is
 * running it rebuilds the Docker stack via `make all` so code changes become
 * visible — a sandboxed browser button can't run host commands itself, hence the
 * daemon. When the daemon is off it falls back to pulling the latest workspace.
 */
export const UpdateButton: React.FC = () => {
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const user = useUserStore.getState();
    const workspace = user.activeWorkspace();
    const jwt = user.activePageJwt() ?? "";
    if (workspace) await usePageStore.getState().fetchPages(workspace._id, jwt);
  }

  async function onUpdate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await rebuildServerUp())) {
        await refresh();
        useToastStore.getState().push({ kind: "info", title: "Workspace refreshed", description: "Run `make rebuild-server` so Update rebuilds the app." });
        return;
      }
      if (!globalThis.confirm("Rebuild the ft_transcendence stack via `make all`? This recreates the containers and takes a few minutes.")) return;
      useToastStore.getState().push({ kind: "info", title: "Rebuilding via make all…", description: "Takes a few minutes — watch the rebuild-server terminal." });
      const result = await runHostRebuild();
      if (result.ok) {
        useToastStore.getState().push({ kind: "success", title: "Rebuild complete", description: "Reloading…" });
        setTimeout(() => globalThis.location.reload(), 900);
      } else {
        useToastStore.getState().push({ kind: "error", title: "Rebuild failed", description: result.message ?? "See the rebuild-server terminal." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label="Update — rebuild the app (make all) or refresh the workspace"
      disabled={busy}
      onClick={() => { void onUpdate(); }}
      className={cx(
        "inline-flex h-[var(--osio-control-h-sm)] items-center gap-1.5 rounded-[var(--osio-radius-control)] border border-[var(--osio-update)]/25 bg-[var(--osio-update)]/12 px-2.5 text-xs font-semibold text-[var(--osio-update)] transition-[background-color,border-color,color,transform] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)] active:scale-[0.97] hover:border-[var(--osio-update)]/40 hover:bg-[var(--osio-update)]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-update)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-topbar-bg)] disabled:opacity-60 disabled:active:scale-100",
      )}
    >
      <RefreshCw size={13} aria-hidden className={busy ? "animate-spin" : undefined} />
      Update
    </button>
  );
};
