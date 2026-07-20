/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeProblemsPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { buildIdeFileTree, flattenIdeTree } from "@/features/ide/model/ideFileTree";
import { pathForPage } from "@/features/ide/model/idePaths";
import { useDiagnosticsStore, type IdeDiagnostic } from "@/features/ide/model/diagnosticsStore";

const EMPTY: never[] = [];
const URI_PREFIX = "file:///workspace/";

function severityIcon(severity: number) {
  if (severity === 1) return <AlertCircle size={13} className="text-[var(--osio-danger,#f87171)]" />;
  if (severity === 2) return <AlertTriangle size={13} className="text-[var(--osio-warning,#fbbf24)]" />;
  return <Info size={13} className="text-[var(--osio-code-fg-muted)]" />;
}

/** Diagnostics/Problems panel (P5): every LSP diagnostic across open documents,
 *  grouped by file, click-to-open. Fed by the lspClient publishDiagnostics tap. */
export const IdeProblemsPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId]) ?? EMPTY;
  const byUri = useDiagnosticsStore((s) => s.byUri);

  // relPath → page, so a diagnostic URI resolves back to the page it opens.
  const pageByPath = React.useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const node of flattenIdeTree(buildIdeFileTree(pages))) {
      if (node.isFolder) continue;
      map.set(pathForPage(node.page._id, (id) => usePageStore.getState().pageById(id)), {
        id: node.page._id,
        title: node.page.title,
      });
    }
    return map;
  }, [pages]);

  const groups = React.useMemo(
    () =>
      Object.entries(byUri)
        .filter(([, diags]) => diags.length > 0)
        .map(([uri, diags]) => ({ uri, rel: uri.startsWith(URI_PREFIX) ? uri.slice(URI_PREFIX.length) : uri, diags }))
        .sort((a, b) => a.rel.localeCompare(b.rel)),
    [byUri],
  );

  const open = React.useCallback(
    (rel: string) => {
      const target = pageByPath.get(rel);
      if (target) usePageStore.getState().openPage({ id: target.id, workspaceId, kind: "page", title: target.title });
    },
    [pageByPath, workspaceId],
  );

  if (groups.length === 0) {
    return <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">No problems detected.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto py-1 text-[12px]">
      {groups.map((group) => (
        <div key={group.uri}>
          <button
            type="button"
            onClick={() => open(group.rel)}
            className="flex w-full items-center gap-1.5 px-3 py-1 text-left font-medium text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.12))]"
          >
            <span className="truncate">{group.rel.split("/").pop()}</span>
            <span className="text-[var(--osio-code-fg-muted)]">{group.rel}</span>
            <span className="ml-auto text-[10px] text-[var(--osio-code-fg-muted)]">{group.diags.length}</span>
          </button>
          {group.diags
            .slice()
            .sort((a, b) => a.line - b.line)
            .map((d: IdeDiagnostic, i) => (
              <button
                key={`${group.uri}:${i}`}
                type="button"
                onClick={() => open(group.rel)}
                title={d.message}
                className="flex w-full items-start gap-1.5 py-0.5 pl-6 pr-3 text-left hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.12))]"
              >
                <span className="mt-0.5 shrink-0">{severityIcon(d.severity)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--osio-code-fg-muted)]">{d.message}</span>
                <span className="shrink-0 text-[10px] text-[var(--osio-code-fg-muted)]">
                  {d.line + 1}:{d.character + 1}
                </span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
};
